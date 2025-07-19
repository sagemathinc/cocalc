/*
Given a path to a folder on the filesystem, this provides
a wrapper class with an API similar to the fs/promises modules,
but which only allows access to files in that folder.
It's a bit simpler with return data that is always
serializable.

Absolute and relative paths are considered as relative to the input folder path.

REFERENCE: We don't use https://github.com/metarhia/sandboxed-fs, but did
look at the code.



SECURITY:

The following could be a big problem -- user somehow create or change path to
be a dangerous symlink *after* the realpath check below, but before we do an fs *read*
operation. If they did that, then we would end up reading the target of the
symlink. I.e., if they could somehow create the file *as an unsafe symlink*
right after we confirm that it does not exist and before we read from it. This
would only happen via something not involving this sandbox, e.g., the filesystem
mounted into a container some other way.

In short, I'm worried about:

1. Request to read a file named "link" which is just a normal file. We confirm this using realpath
   in safeAbsPath.
2. Somehow delete "link" and replace it by a new file that is a symlink to "../{project_id}/.ssh/id_ed25519"
3. Read the file "link" and get the contents of "../{project_id}/.ssh/id_ed25519".

The problem is that 1 and 3 happen microseconds apart as separate calls to the filesystem.

**[ ] TODO -- NOT IMPLEMENTED YET: This is why we have to uses file descriptors!**

1. User requests to read a file named "link" which is just a normal file.
2. We wet file descriptor fd for whatever "link" is. Then confirm this is OK using realpath in safeAbsPath.
3. user somehow deletes "link" and replace it by a new file that is a symlink to "../{project_id}/.ssh/id_ed25519"
4. We read from the file descriptor fd and get the contents of original "link" (or error).

*/

import {
  appendFile,
  chmod,
  cp,
  constants,
  copyFile,
  link,
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  mkdir,
  stat,
  symlink,
  truncate,
  writeFile,
  unlink,
  utimes,
} from "node:fs/promises";
import { watch } from "node:fs";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { type DirectoryListingEntry } from "@cocalc/util/types";
import getListing from "@cocalc/backend/get-listing";
import { join, resolve } from "path";
import { replace_all } from "@cocalc/util/misc";
import { EventIterator } from "@cocalc/util/event-iterator";

export class SandboxedFilesystem {
  // path should be the path to a FOLDER on the filesystem (not a file)
  constructor(public readonly path: string) {
    for (const f in this) {
      if (f == "safeAbsPath" || f == "constructor" || f == "path") {
        continue;
      }
      const orig = this[f];
      // @ts-ignore
      this[f] = async (...args) => {
        try {
          // @ts-ignore
          return await orig(...args);
        } catch (err) {
          if (err.path) {
            err.path = err.path.slice(this.path.length + 1);
          }
          err.message = replace_all(err.message, this.path + "/", "");
          throw err;
        }
      };
    }
  }

  safeAbsPath = async (path: string): Promise<string> => {
    if (typeof path != "string") {
      throw Error(`path must be a string but is of type ${typeof path}`);
    }
    // pathInSandbox is *definitely* a path in the sandbox:
    const pathInSandbox = join(this.path, resolve("/", path));
    // However, there is still one threat, which is that it could
    // be a path to an existing link that goes out of the sandbox. So
    // we resolve to the realpath:
    try {
      const p = await realpath(pathInSandbox);
      if (p != this.path && !p.startsWith(this.path + "/")) {
        throw Error(
          `realpath of '${path}' resolves to a path outside of sandbox`,
        );
      }
      // don't return the result of calling realpath -- what's important is
      // their path's realpath is in the sandbox.
      return pathInSandbox;
    } catch (err) {
      if (err.code == "ENOENT") {
        return pathInSandbox;
      } else {
        throw err;
      }
    }
  };

  appendFile = async (path: string, data: string | Buffer, encoding?) => {
    return await appendFile(await this.safeAbsPath(path), data, encoding);
  };

  chmod = async (path: string, mode: string | number) => {
    await chmod(await this.safeAbsPath(path), mode);
  };

  constants = async (): Promise<{ [key: string]: number }> => {
    return constants;
  };

  copyFile = async (src: string, dest: string) => {
    await copyFile(await this.safeAbsPath(src), await this.safeAbsPath(dest));
  };

  cp = async (src: string, dest: string, options?) => {
    await cp(
      await this.safeAbsPath(src),
      await this.safeAbsPath(dest),
      options,
    );
  };

  exists = async (path: string) => {
    return await exists(await this.safeAbsPath(path));
  };

  // hard link
  link = async (existingPath: string, newPath: string) => {
    return await link(
      await this.safeAbsPath(existingPath),
      await this.safeAbsPath(newPath),
    );
  };

  ls = async (
    path: string,
    { hidden, limit }: { hidden?: boolean; limit?: number } = {},
  ): Promise<DirectoryListingEntry[]> => {
    return await getListing(await this.safeAbsPath(path), hidden, {
      limit,
      home: "/",
    });
  };

  lstat = async (path: string) => {
    return await lstat(await this.safeAbsPath(path));
  };

  mkdir = async (path: string, options?) => {
    await mkdir(await this.safeAbsPath(path), options);
  };

  readFile = async (path: string, encoding?: any): Promise<string | Buffer> => {
    return await readFile(await this.safeAbsPath(path), encoding);
  };

  readdir = async (path: string): Promise<string[]> => {
    return await readdir(await this.safeAbsPath(path));
  };

  realpath = async (path: string): Promise<string> => {
    const x = await realpath(await this.safeAbsPath(path));
    return x.slice(this.path.length + 1);
  };

  rename = async (oldPath: string, newPath: string) => {
    await rename(
      await this.safeAbsPath(oldPath),
      await this.safeAbsPath(newPath),
    );
  };

  rm = async (path: string, options?) => {
    await rm(await this.safeAbsPath(path), options);
  };

  rmdir = async (path: string, options?) => {
    await rmdir(await this.safeAbsPath(path), options);
  };

  stat = async (path: string) => {
    return await stat(await this.safeAbsPath(path));
  };

  symlink = async (target: string, path: string) => {
    return await symlink(
      await this.safeAbsPath(target),
      await this.safeAbsPath(path),
    );
  };

  truncate = async (path: string, len?: number) => {
    await truncate(await this.safeAbsPath(path), len);
  };

  unlink = async (path: string) => {
    await unlink(await this.safeAbsPath(path));
  };

  utimes = async (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => {
    await utimes(await this.safeAbsPath(path), atime, mtime);
  };

  watch = async (
    filename: string,
    options?: {
      persistent?: boolean;
      recursive?: boolean;
      encoding?: string;
      signal?: AbortSignal;
      maxQueue?: number;
      overflow?: "ignore" | "throw";
    },
  ) => {
    // NOTE: in node v24 they fixed the fs/promises watch to have a queue, but previous
    // versions were clearly badly implemented so we reimplement it from scratch
    // using the non-promise watch.
    const watcher = watch(await this.safeAbsPath(filename), options as any);
    const iter = new EventIterator(watcher, "change", {
      maxQueue: options?.maxQueue ?? 2048,
      overflow: options?.overflow,
      map: (args) => {
        // exact same api as new fs/promises watch
        return { eventType: args[0], filename: args[1] };
      },
      onEnd: () => {
        watcher.close();
      },
    });
    // AbortController signal can cause this
    watcher.once("close", () => {
      iter.end();
    });
    return iter;
  };

  writeFile = async (path: string, data: string | Buffer) => {
    return await writeFile(await this.safeAbsPath(path), data);
  };
}
