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
  readlink,
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
import { move } from "fs-extra";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { basename, dirname, join, resolve } from "path";
import { replace_all } from "@cocalc/util/misc";
import find, { type FindOptions } from "./find";
import ripgrep, { type RipgrepOptions } from "./ripgrep";
import fd, { type FdOptions } from "./fd";
import dust, { type DustOptions } from "./dust";
import rustic from "./rustic";
import { type ExecOutput } from "./exec";
import { rusticRepo } from "@cocalc/backend/data";
import ouch, { type OuchOptions } from "./ouch";
import cpExec from "./cp";
import { type CopyOptions } from "@cocalc/conat/files/fs";
export { type CopyOptions };
import { ConatError } from "@cocalc/conat/core/client";
import getListing, { type Files } from "./get-listing";
import LRU from "lru-cache";
import watch, { type WatchIterator, type WatchOptions } from "./watch";
//import getLogger from "@cocalc/backend/logger";

//const logger = getLogger("sandbox:fs");

// max time code can run (in safe mode), e.g., for find,
// ripgrep, fd, and dust.
const MAX_TIMEOUT = 5_000;

// Maximum amount of memory for the "last value on disk" data, which
// supports a much better "sync with file state on disk" algorithm.
const MAX_LAST_ON_DISK = 50_000_000; // 50 MB
const LAST_ON_DISK_TTL = 1000 * 60 * 5; // 5 minutes

interface Options {
  // unsafeMode -- if true, assume security model where user is running this
  // themself, e.g., in a project, so no security is needed at all.
  unsafeMode?: boolean;
  // readonly -- only allow operations that don't change files
  readonly?: boolean;
  host?: string;
  rusticRepo?: string;
}

// If you add any methods below that are NOT for the public api
// be sure to exclude them here!
const INTERNAL_METHODS = new Set([
  "safeAbsPath",
  "safeAbsPaths",
  "constructor",
  "path",
  "unsafeMode",
  "readonly",
  "assertWritable",
  "rusticRepo",
  "host",
  "readFileLock",
  "_lockFile",
  "lastOnDisk",
]);

export class SandboxedFilesystem {
  public readonly unsafeMode: boolean;
  public readonly readonly: boolean;
  public rusticRepo: string;
  private host?: string;
  private lastOnDisk = new LRU<string, string>({
    maxSize: MAX_LAST_ON_DISK,
    sizeCalculation: (value) => value.length,
    ttl: LAST_ON_DISK_TTL,
  });

  constructor(
    // path should be the path to a FOLDER on the filesystem (not a file)
    public readonly path: string,
    {
      unsafeMode = false,
      readonly = false,
      host = "global",
      rusticRepo: repo,
    }: Options = {},
  ) {
    this.unsafeMode = !!unsafeMode;
    this.readonly = !!readonly;
    this.host = host;
    this.rusticRepo = repo ?? rusticRepo;
    for (const f in this) {
      if (INTERNAL_METHODS.has(f)) {
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

  private assertWritable = (path: string) => {
    if (this.readonly) {
      throw new SandboxError(
        `EACCES: permission denied -- read only filesystem, open '${path}'`,
        { errno: -13, code: "EACCES", syscall: "open", path },
      );
    }
  };

  safeAbsPaths = async (path: string[] | string): Promise<string[]> => {
    return await Promise.all(
      (typeof path == "string" ? [path] : path).map(this.safeAbsPath),
    );
  };

  safeAbsPath = async (path: string): Promise<string> => {
    if (typeof path != "string") {
      throw Error(`path must be a string but is of type ${typeof path}`);
    }
    // pathInSandbox is *definitely* a path in the sandbox:
    const pathInSandbox = join(this.path, resolve("/", path));
    if (this.unsafeMode) {
      // not secure -- just convenient.
      return pathInSandbox;
    }
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
    this.assertWritable(path);
    return await appendFile(await this.safeAbsPath(path), data, encoding);
  };

  chmod = async (path: string, mode: string | number) => {
    this.assertWritable(path);
    await chmod(await this.safeAbsPath(path), mode);
  };

  constants = async (): Promise<{ [key: string]: number }> => {
    return constants;
  };

  copyFile = async (src: string, dest: string) => {
    this.assertWritable(dest);
    await copyFile(await this.safeAbsPath(src), await this.safeAbsPath(dest));
  };

  cp = async (src: string | string[], dest: string, options?: CopyOptions) => {
    this.assertWritable(dest);
    dest = await this.safeAbsPath(dest);

    // ensure containing directory of destination exists -- node cp doesn't
    // do this but for cocalc this is very convenient and saves some network
    // round trips.
    const destDir = dirname(dest);
    if (destDir != this.path && !(await exists(destDir))) {
      await mkdir(destDir, { recursive: true });
    }

    const v = await this.safeAbsPaths(src);
    if (!options?.reflink) {
      // can use node cp:
      for (const path of v) {
        if (typeof src == "string") {
          await cp(path, dest, options);
        } else {
          // copying multiple files to a directory
          await cp(path, join(dest, basename(path)), options);
        }
      }
    } else {
      // /usr/bin/cp.  NOte that behavior depends on string versus string[],
      // so we pass the absolute paths v in that way.
      await cpExec(
        typeof src == "string" ? v[0] : v,
        dest,
        capTimeout(options, MAX_TIMEOUT),
      );
    }
  };

  exists = async (path: string) => {
    return await exists(await this.safeAbsPath(path));
  };

  find = async (path: string, options?: FindOptions): Promise<ExecOutput> => {
    return await find(
      await this.safeAbsPath(path),
      capTimeout(options, MAX_TIMEOUT),
    );
  };

  getListing = async (
    path: string,
  ): Promise<{ files: Files; truncated?: boolean }> => {
    return await getListing(await this.safeAbsPath(path));
  };

  // find files
  fd = async (path: string, options?: FdOptions): Promise<ExecOutput> => {
    return await fd(
      await this.safeAbsPath(path),
      capTimeout(options, MAX_TIMEOUT),
    );
  };

  // disk usage
  dust = async (path: string, options?: DustOptions): Promise<ExecOutput> => {
    return await dust(
      await this.safeAbsPath(path),
      // dust reasonably takes longer than the other commands and is used less,
      // so for now we give it more breathing room.
      capTimeout(options, 4 * MAX_TIMEOUT),
    );
  };

  // compression
  ouch = async (args: string[], options?: OuchOptions): Promise<ExecOutput> => {
    options = { ...options };
    if (options.cwd) {
      options.cwd = await this.safeAbsPath(options.cwd);
    }
    return await ouch(
      [args[0]].concat(await Promise.all(args.slice(1).map(this.safeAbsPath))),
      capTimeout(options, 6 * MAX_TIMEOUT),
    );
  };

  // backups
  rustic = async (
    args: string[],
    {
      timeout = 120_000,
      maxSize = 10_000_000, // the json output can be quite large
      cwd,
    }: { timeout?: number; maxSize?: number; cwd?: string } = {},
  ): Promise<ExecOutput> => {
    return await rustic(args, {
      repo: this.rusticRepo,
      safeAbsPath: this.safeAbsPath,
      timeout,
      maxSize,
      host: this.host,
      cwd,
    });
  };

  ripgrep = async (
    path: string,
    pattern: string,
    options?: RipgrepOptions,
  ): Promise<ExecOutput> => {
    return await ripgrep(
      await this.safeAbsPath(path),
      pattern,
      capTimeout(options, MAX_TIMEOUT),
    );
  };

  // hard link
  link = async (existingPath: string, newPath: string) => {
    this.assertWritable(newPath);
    return await link(
      await this.safeAbsPath(existingPath),
      await this.safeAbsPath(newPath),
    );
  };

  lstat = async (path: string) => {
    return await lstat(await this.safeAbsPath(path));
  };

  mkdir = async (path: string, options?) => {
    this.assertWritable(path);
    await mkdir(await this.safeAbsPath(path), options);
  };

  private readFileLock = new Set<string>();
  readFile = async (
    path: string,
    encoding?: any,
    lock?: number,
  ): Promise<string | Buffer> => {
    const p = await this.safeAbsPath(path);
    if (this.readFileLock.has(p)) {
      throw new ConatError(`path is locked - ${p}`, { code: "LOCK" });
    }
    if (lock) {
      this._lockFile(p, lock);
    }

    return await readFile(p, encoding);
  };

  lockFile = async (path: string, lock?: number) => {
    const p = await this.safeAbsPath(path);
    this._lockFile(p, lock);
  };

  private _lockFile = (path: string, lock?: number) => {
    if (lock) {
      this.readFileLock.add(path);
      setTimeout(() => {
        this.readFileLock.delete(path);
      }, lock);
    } else {
      this.readFileLock.delete(path);
    }
  };

  readdir = async (path: string, options?) => {
    const x = (await readdir(await this.safeAbsPath(path), options)) as any[];
    if (options?.withFileTypes) {
      // each entry in x has a name and parentPath field, which refers to the
      // absolute paths to the directory that contains x or the target of x (if
      // it is a link).  This is an absolute path on the fileserver, which we try
      // not to expose from the sandbox, hence we modify them all if possible.
      for (const a of x) {
        if (a.name.startsWith(this.path)) {
          a.name = a.name.slice(this.path.length + 1);
        }
        if (a.parentPath.startsWith(this.path)) {
          a.parentPath = a.parentPath.slice(this.path.length + 1);
        }
      }
    }

    return x;
  };

  readlink = async (path: string): Promise<string> => {
    return await readlink(await this.safeAbsPath(path));
  };

  realpath = async (path: string): Promise<string> => {
    const x = await realpath(await this.safeAbsPath(path));
    return x.slice(this.path.length + 1);
  };

  rename = async (oldPath: string, newPath: string) => {
    this.assertWritable(newPath);
    await rename(
      await this.safeAbsPath(oldPath),
      await this.safeAbsPath(newPath),
    );
  };

  move = async (
    src: string,
    dest: string,
    options?: { overwrite?: boolean },
  ) => {
    this.assertWritable(dest);
    await move(
      await this.safeAbsPath(src),
      await this.safeAbsPath(dest),
      options,
    );
  };

  rm = async (path: string | string[], options?) => {
    const v = await this.safeAbsPaths(path);
    const f = async (path) => {
      this.assertWritable(path);
      await rm(path, options);
    };
    await Promise.all(v.map(f));
  };

  rmdir = async (path: string, options?) => {
    this.assertWritable(path);
    await rmdir(await this.safeAbsPath(path), options);
  };

  stat = async (path: string) => {
    return await stat(await this.safeAbsPath(path));
  };

  symlink = async (target: string, path: string) => {
    this.assertWritable(path);
    return await symlink(
      await this.safeAbsPath(target),
      await this.safeAbsPath(path),
    );
  };

  truncate = async (path: string, len?: number) => {
    this.assertWritable(path);
    await truncate(await this.safeAbsPath(path), len);
  };

  unlink = async (path: string) => {
    this.assertWritable(path);
    await unlink(await this.safeAbsPath(path));
  };

  utimes = async (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => {
    this.assertWritable(path);
    await utimes(await this.safeAbsPath(path), atime, mtime);
  };

  watch = async (
    path: string,
    options: WatchOptions = {},
  ): Promise<WatchIterator> => {
    return watch(await this.safeAbsPath(path), options, this.lastOnDisk);
  };

  writeFile = async (
    path: string,
    data: string | Buffer,
    saveLast?: boolean,
  ) => {
    this.assertWritable(path);
    const p = await this.safeAbsPath(path);
    if (saveLast && typeof data == "string") {
      this.lastOnDisk.set(p, data);
    }
    return await writeFile(p, data);
  };
}

export class SandboxError extends Error {
  code: string;
  errno: number;
  syscall: string;
  path: string;
  constructor(mesg: string, { code, errno, syscall, path }) {
    super(mesg);
    this.code = code;
    this.errno = errno;
    this.syscall = syscall;
    this.path = path;
  }
}

function capTimeout(options, max: number) {
  if (options == null) {
    return { timeout: max };
  }

  let timeout;
  try {
    timeout = parseFloat(options.timeout);
  } catch {
    return { ...options, timeout: max };
  }
  if (!isFinite(timeout)) {
    return { ...options, timeout: max };
  }
  return { ...options, timeout: Math.min(timeout, max) };
}
