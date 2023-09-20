import type { ClientFs as ClientFsType } from "@cocalc/sync/client/types";
import Client from "./index";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { join } from "node:path";
import { readFile, writeFile, stat as statFileAsync } from "node:fs/promises";
import { stat } from "fs";
import type { CB } from "@cocalc/util/types/callback";
import { Watcher } from "@cocalc/backend/watcher";

export class ClientFs extends Client implements ClientFsType {
  private filesystemClient = new FileSystemClient(this.dbg);

  write_file = this.filesystemClient.write_file;
  path_read = this.filesystemClient.path_read;
  path_stat = this.filesystemClient.path_stat;
  file_size_async = this.filesystemClient.file_size_async;
  file_stat_async = this.filesystemClient.file_stat_async;
  watch_file = this.filesystemClient.watch_file;

  constructor({
    project_id,
    client_id,
    home,
  }: {
    project_id: string;
    client_id?: string;
    home?: string;
  }) {
    super({ project_id, client_id });
    this.filesystemClient.setHome(home ?? process.env.HOME ?? "/home/user");
  }
}

// Some functions for reading and writing files under node.js
// where the read and write is aware of other reading and writing,
// motivated by the needs of realtime sync.
export class FileSystemClient {
  private _file_io_lock?: { [key: string]: number }; // file → timestamps
  private dbg;
  private home: string;

  constructor(dbg) {
    this.dbg = dbg;
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
    const dbg = this.dbg(`write_file ${opts.path}`);
    dbg();
    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock automatically expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      dbg("LOCK");
      // Try again in about 1s.
      setTimeout(() => this.write_file(opts), 500 + 500 * Math.random());
      return;
    }
    this._file_io_lock[path] = now;
    dbg("file_io_lock", this._file_io_lock);
    try {
      await ensureContainingDirectoryExists(path);
      await writeFile(path, opts.data);
      dbg("success");
      opts.cb();
    } catch (error) {
      const err = error;
      dbg(`error -- ${err}`);
      opts.cb(err);
    } finally {
      delete this._file_io_lock[path];
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
    const dbg = this.dbg(
      `path_read(path='${opts.path}', maxsize_MB=${opts.maxsize_MB})`,
    );
    dbg();
    if (this._file_io_lock == null) {
      this._file_io_lock = {};
    }

    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      dbg("LOCK");
      // Try again in 1s.
      setTimeout(
        async () => await this.path_read(opts),
        500 + 500 * Math.random(),
      );
      return;
    }
    this._file_io_lock[path] = now;

    dbg("_file_io_lock", this._file_io_lock);

    // checking filesize limitations
    if (opts.maxsize_MB != null) {
      dbg("check if file too big");
      let size: number | undefined = undefined;
      try {
        size = await this.file_size_async(opts.path);
      } catch (err) {
        dbg(`error checking -- ${err}`);
        opts.cb(err);
        return;
      }

      if (size > opts.maxsize_MB * 1000000) {
        dbg("file is too big!");
        opts.cb(
          new Error(
            `file '${opts.path}' size (=${
              size / 1000000
            }MB) too large (must be at most ${
              opts.maxsize_MB
            }MB); try opening it in a Terminal with vim instead or click Help in the upper right to open a support request`,
          ),
        );
        return;
      } else {
        dbg("file is fine");
      }
    }

    // if the above passes, actually reading file

    try {
      const data = await readFile(path);
      dbg("read file");
      content = data.toString();
    } catch (err) {
      dbg(`error reading file -- ${err}`);
      opts.cb(err);
      return;
    }

    // release lock
    if (this._file_io_lock) {
      delete this._file_io_lock[path];
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
    stat(opts.path, opts.cb);
  };

  watch_file = ({
    path: relPath,
    interval = 1500, // polling interval in ms
    debounce = 500, // don't fire until at least this many ms after the file has REMAINED UNCHANGED
  }: {
    path: string;
    interval?: number;
    debounce?: number;
  }): Watcher => {
    const path = join(this.home, relPath);
    const dbg = this.dbg(`watch_file(path='${path}')`);
    dbg(`watching file '${path}'`);
    return new Watcher(path, interval, debounce);
  };
}
