import type { ClientFs as ClientFsType } from "@cocalc/sync/client/types";
import Client, { Role } from "./index";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { join } from "node:path";
import { readFile, writeFile, stat as statFileAsync } from "node:fs/promises";
import { exists, stat } from "fs";
import fs from "node:fs";
import type { CB } from "@cocalc/util/types/callback";
import { Watcher } from "@cocalc/backend/watcher";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("sync-client:client-fs");

export class ClientFs extends Client implements ClientFsType {
  private filesystemClient = new FileSystemClient();

  write_file = this.filesystemClient.write_file;
  path_read = this.filesystemClient.path_read;
  path_stat = this.filesystemClient.path_stat;
  path_exists = this.filesystemClient.path_exists;
  file_size_async = this.filesystemClient.file_size_async;
  file_stat_async = this.filesystemClient.file_stat_async;
  watch_file = this.filesystemClient.watch_file;
  path_access = this.filesystemClient.path_access;

  constructor({
    project_id,
    client_id,
    home,
    role,
  }: {
    project_id: string;
    client_id?: string;
    home?: string;
    role: Role;
  }) {
    super({ project_id, client_id, role });
    this.filesystemClient.setHome(home ?? process.env.HOME ?? "/home/user");
  }
}

// Some functions for reading and writing files under node.js
// where the read and write is aware of other reading and writing,
// motivated by the needs of realtime sync.
export class FileSystemClient {
  private _file_io_lock?: { [key: string]: number }; // file → timestamps
  private home: string;

  constructor() {
    this.home = process.env.HOME ?? "/home/user";
  }

  setHome(home: string) {
    this.home = home;
  }

  // Write a file to a given path (relative to this.home) on disk; will create containing directory.
  // If file is currently being written or read in this process, will result in error (instead of silently corrupt data).
  // WARNING: See big comment below for path_read.
  write_file = async (opts: {
    path: string;
    data: string;
    cb: CB<void>;
  }): Promise<void> => {
    // WARNING: despite being async, this returns nothing!
    const path = join(this.home, opts.path);
    if (this._file_io_lock == null) {
      this._file_io_lock = {};
    }
    logger.debug("write_file", path);
    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock automatically expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      logger.debug("write_file", path, "LOCK");
      // Try again in about 1s.
      setTimeout(() => this.write_file(opts), 500 + 500 * Math.random());
      return;
    }
    logger.debug("write_file", "file_io_lock", this._file_io_lock);
    try {
      this._file_io_lock[path] = now;
      logger.debug(path, "write_file -- ensureContainingDirectoryExists");
      await ensureContainingDirectoryExists(path);
      logger.debug(path, "write_file -- actually writing it to disk");
      await writeFile(path, opts.data);
      logger.debug("write_file", "success");
      opts.cb();
    } catch (error) {
      const err = error;
      logger.debug("write_file", "error", err);
      opts.cb(err);
    } finally {
      if (this._file_io_lock != null) {
        delete this._file_io_lock[path];
      }
    }
  };

  // Read file as a string from disk.
  // If file is currently being written or read in this process,
  // will retry until it isn't, so we do not get an error and we
  // do NOT get silently corrupted data.
  // TODO and HUGE AWARNING: Despite this function being async, it DOES NOT
  // RETURN ANYTHING AND DOES NOT THROW EXCEPTIONS!  Just use it like any
  // other old cb function.  Todo: rewrite this and anything that uses it.
  // This is just a halfway step toward rewriting project away from callbacks and coffeescript.
  path_read = async (opts: {
    path: string;
    maxsize_MB?: number; // in megabytes; if given and file would be larger than this, then cb(err)
    cb: CB<string>; // cb(err, file content as string (not Buffer!))
  }): Promise<void> => {
    // WARNING: despite being async, this returns nothing!
    let content: string | undefined = undefined;
    const path = join(this.home, opts.path);
    logger.debug(`path_read(path='${path}', maxsize_MB=${opts.maxsize_MB})`);
    if (this._file_io_lock == null) {
      this._file_io_lock = {};
    }

    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      logger.debug(`path_read(path='${path}')`, "LOCK");
      // Try again in 1s.
      setTimeout(
        async () => await this.path_read(opts),
        500 + 500 * Math.random(),
      );
      return;
    }
    try {
      this._file_io_lock[path] = now;

      logger.debug(
        `path_read(path='${path}')`,
        "_file_io_lock",
        this._file_io_lock,
      );

      // checking filesize limitations
      if (opts.maxsize_MB != null) {
        logger.debug(`path_read(path='${path}')`, "check if file too big");
        let size: number | undefined = undefined;
        try {
          size = await this.file_size_async(path);
        } catch (err) {
          logger.debug("error checking", err);
          opts.cb(err);
          return;
        }

        if (size > opts.maxsize_MB * 1000000) {
          logger.debug(path, "file is too big!");
          opts.cb(
            new Error(
              `file '${path}' size (=${
                size / 1000000
              } MB) too large (must be at most ${
                opts.maxsize_MB
              } MB); try opening it in a Terminal with vim instead or click Help in the upper right to create a support request.`,
            ),
          );
          return;
        } else {
          logger.debug(path, "file is fine");
        }
      }

      // if the above passes, actually reading file

      try {
        const data = await readFile(path);
        logger.debug(path, "read file");
        content = data.toString();
      } catch (err) {
        logger.debug(path, "error reading file", err);
        opts.cb(err);
        return;
      }
    } finally {
      // release lock
      if (this._file_io_lock) {
        delete this._file_io_lock[path];
      }
    }

    opts.cb(undefined, content);
  };

  file_size_async = async (filename: string) => {
    const stat = await this.file_stat_async(filename);
    return stat.size;
  };

  file_stat_async = async (filename: string) => {
    return await statFileAsync(filename);
  };

  path_stat = (opts: { path: string; cb: CB }) => {
    // see https://nodejs.org/api/fs.html#fs_class_fs_stats
    const path = join(this.home, opts.path);
    stat(path, opts.cb);
  };

  path_exists = (opts: { path: string; cb: CB }) => {
    const path = join(this.home, opts.path);
    exists(path, (exists) => {
      opts.cb(undefined, exists);
    });
  };

  watch_file = ({
    path: relPath,
    // don't fire until at least this many ms after the file has REMAINED UNCHANGED
    debounce,
  }: {
    path: string;
    debounce?: number;
  }): Watcher => {
    const path = join(this.home, relPath);
    logger.debug("watching file", { path, debounce });
    return new Watcher(path, { debounce });
  };

  is_deleted = (_path: string, _project_id: string) => {
    // not implemented yet in general
    return undefined;
  };

  set_deleted = (_path: string, _project_id?: string) => {
    // TODO: this should edit the listings
  };

  path_access = (opts: { path: string; mode: string; cb: CB }) => {
    // mode: sub-sequence of 'rwxf' -- see https://nodejs.org/api/fs.html#fs_class_fs_stats
    // cb(err); err = if any access fails; err=undefined if all access is OK
    const path = join(this.home, opts.path);
    let access = 0;
    for (let s of opts.mode) {
      access |= fs[s.toUpperCase() + "_OK"];
    }
    fs.access(path, access, opts.cb);
  };
}
