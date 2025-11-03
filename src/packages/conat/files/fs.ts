/*
Tests are in

packages/backend/conat/files/test/local-path.test.ts

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import {
  watchServer,
  watchClient,
  type WatchIterator,
} from "@cocalc/conat/files/watch";
import listing, {
  type Listing,
  type FileTypeLabel,
  type Files,
} from "./listing";
import { isValidUUID } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import TTL from "@isaacs/ttlcache";
import { getLogger } from "@cocalc/conat/client";
import { make_patch } from "@cocalc/util/dmp";
import type { CompressedPatch } from "@cocalc/util/dmp";

const logger = getLogger("files:fs");

export const DEFAULT_FILE_SERVICE = "fs";

export interface ExecOutput {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
  // true if terminated early due to output size or time
  truncated?: boolean;
}

export interface RipgrepOptions {
  options?: string[];
  darwin?: string[];
  linux?: string[];
  timeout?: number;
  maxSize?: number;
}

export interface FindOptions {
  timeout?: number;
  // all safe whitelisted options to the find command
  options?: string[];
  darwin?: string[];
  linux?: string[];
  maxSize?: number;
}

export interface FdOptions {
  pattern?: string;
  options?: string[];
  darwin?: string[];
  linux?: string[];
  timeout?: number;
  maxSize?: number;
}

export interface DustOptions {
  options?: string[];
  darwin?: string[];
  linux?: string[];
  timeout?: number;
  maxSize?: number;
}

export interface OuchOptions {
  cwd?: string;
  options?: string[];
  timeout?: number;
}

export const OUCH_FORMATS = [
  "zip",
  "7z",
  "tar.gz",
  "tar.xz",
  "tar.bz",
  "tar.bz2",
  "tar.bz3",
  "tar.lz4",
  "tar.sz",
  "tar.zst",
  "tar.br",
];

export type TextEncoding = "utf8" | "utf-8";

/**
 * Payload for writeFile when sending a diff instead of the full file.
 * The client computes a compressed patch (see util/dmp.ts) against the
 * current on-disk contents and includes the corresponding SHA-256 hash.
 * The backend will only apply the patch if the hash matches; otherwise
 * callers should retry with the full file contents.
 */
export interface PatchWriteRequest {
  patch: CompressedPatch | string;
  sha256: string;
  encoding?: TextEncoding;
  maxPatchRatio?: number;
}

export interface WriteFileDeltaOptions {
  baseContents?: string;
  baseContents;
  encoding?: TextEncoding;
  maxPatchRatio?: number;
  saveLast?: boolean;
}

export interface CopyOptions {
  dereference?: boolean;
  errorOnExist?: boolean;
  force?: boolean;
  preserveTimestamps?: boolean;
  recursive?: boolean;
  verbatimSymlinks?: boolean;
  // if true, will try to use copy-on-write - this spawns the operating system '/usr/bin/cp' command.
  reflink?: boolean;
  // when using /usr/bin/cp:
  timeout?: number;
}

export interface Filesystem {
  appendFile: (path: string, data: string | Buffer, encoding?) => Promise<void>;
  chmod: (path: string, mode: string | number) => Promise<void>;
  constants: () => Promise<{ [key: string]: number }>;
  copyFile: (src: string, dest: string) => Promise<void>;

  cp: (
    // NOTE!: we also support any array of src's unlike node's cp;
    // however, when src is an array, the target *must* be a directory and this works like
    // /usr/bin/cp, where files are copied INTO that target.
    // When src is a string, this is just normal node cp behavior.
    src: string | string[],
    dest: string,
    options?: CopyOptions,
  ) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  link: (existingPath: string, newPath: string) => Promise<void>;
  lstat: (path: string) => Promise<IStats>;
  mkdir: (path: string, options?) => Promise<void>;

  // move from fs-extra -- https://github.com/jprichardson/node-fs-extra/blob/HEAD/docs/move.md
  move: (
    src: string | string[],
    dest: string,
    options?: { overwrite?: boolean },
  ) => Promise<void>;

  readFile: (
    path: string,
    encoding?: string,

    // If lock is given then any other client that tries to read from this
    // for lock ms after the lock is created will get an exception with code='LOCK'.
    // This is an extension to node's fs.readFile that is very useful when
    // initializing realtime sync clients.  It makes it so we can have several
    // clients all try to read at the same time, and exactly one wins.
    lock?: number,
  ) => Promise<string | Buffer>;
  // lockFile is exactly like readFile with the lock parameter, but
  // it lets you lock (or unlock) a file without actually reading it.
  lockFile: (path: string, lock?: number) => Promise<void>;
  readdir(path: string, options?): Promise<string[]>;
  readdir(path: string, options: { withFileTypes?: false }): Promise<string[]>;
  readdir(path: string, options: { withFileTypes: true }): Promise<IDirent[]>;
  readlink: (path: string) => Promise<string>;
  realpath: (path: string) => Promise<string>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string | string[], options?) => Promise<void>;
  rmdir: (path: string, options?) => Promise<void>;
  stat: (path: string) => Promise<IStats>;
  symlink: (target: string, path: string) => Promise<void>;
  truncate: (path: string, len?: number) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  utimes: (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => Promise<void>;
  // for lock see docs for readFile above
  writeFile: (
    path: string,
    data: string | Buffer | PatchWriteRequest,
    saveLast?: boolean,
  ) => Promise<void>;
  writeFileDelta: (
    path: string,
    content: string | Buffer,
    options?: WriteFileDeltaOptions,
  ) => Promise<void>;
  // todo: typing
  watch: (path: string, options?) => Promise<WatchIterator>;

  // compression
  ouch: (args: string[], options?: OuchOptions) => Promise<ExecOutput>;

  // We add very little to the Filesystem api, but we have to add
  // a sandboxed "find" command, since it is a 1-call way to get
  // arbitrary directory listing info, which is just not possible
  // with the fs API, but required in any serious application.
  // find -P {path} -maxdepth 1 -mindepth 1 -printf {printf}
  // For security reasons, this does not support all find arguments,
  // and can only use limited resources.
  find: (path: string, options?: FindOptions) => Promise<ExecOutput>;
  getListing: (path: string) => Promise<{ files: Files; truncated?: boolean }>;

  // Convenience function that uses the find and stat support to
  // provide all files in a directory by using tricky options to find,
  // and ensuring they are used by stat in a consistent way for updates.
  listing?: (path: string) => Promise<Listing>;

  // fd is a rust rewrite of find that is extremely fast at finding
  // files that match an expression.
  fd: (path: string, options?: FdOptions) => Promise<ExecOutput>;

  // dust is an amazing disk space tool
  dust: (path: string, options?: DustOptions) => Promise<ExecOutput>;

  // We add ripgrep, as a 1-call way to very efficiently search in files
  // directly on whatever is serving files.
  // For security reasons, this does not support all ripgrep arguments,
  // and can only use limited resources.
  ripgrep: (
    path: string,
    pattern: string,
    options?: RipgrepOptions,
  ) => Promise<ExecOutput>;

  rustic: (args: string[]) => Promise<ExecOutput>;
}

interface IDirent {
  name: string;
  parentPath: string;
  path: string;
  type?: number;
}

const DIRENT_TYPES = {
  0: "UNKNOWN",
  1: "FILE",
  2: "DIR",
  3: "LINK",
  4: "FIFO",
  5: "SOCKET",
  6: "CHAR",
  7: "BLOCK",
};

class Dirent {
  constructor(
    public name: string,
    public parentPath: string,
    public path: string,
    public type: number,
  ) {}
  isFile = () => DIRENT_TYPES[this.type] == "FILE";
  isDirectory = () => DIRENT_TYPES[this.type] == "DIR";
  isSymbolicLink = () => DIRENT_TYPES[this.type] == "LINK";
  isFIFO = () => DIRENT_TYPES[this.type] == "FIFO";
  isSocket = () => DIRENT_TYPES[this.type] == "SOCKET";
  isCharacterDevice = () => DIRENT_TYPES[this.type] == "CHAR";
  isBlockDevice = () => DIRENT_TYPES[this.type] == "BLOCK";
}

interface IStats {
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
}

export class Stats {
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;

  constructor(private constants: { [key: string]: number }) {}

  isSymbolicLink = () =>
    (this.mode & this.constants.S_IFMT) === this.constants.S_IFLNK;

  isFile = () => (this.mode & this.constants.S_IFMT) === this.constants.S_IFREG;

  isDirectory = () =>
    (this.mode & this.constants.S_IFMT) === this.constants.S_IFDIR;

  isBlockDevice = () =>
    (this.mode & this.constants.S_IFMT) === this.constants.S_IFBLK;

  isCharacterDevice = () =>
    (this.mode & this.constants.S_IFMT) === this.constants.S_IFCHR;

  isFIFO = () => (this.mode & this.constants.S_IFMT) === this.constants.S_IFIFO;

  isSocket = () =>
    (this.mode & this.constants.S_IFMT) === this.constants.S_IFSOCK;

  get type(): FileTypeLabel {
    switch (this.mode & this.constants.S_IFMT) {
      case this.constants.S_IFLNK:
        return "l";
      case this.constants.S_IFREG:
        return "f";
      case this.constants.S_IFDIR:
        return "d";
      case this.constants.S_IFBLK:
        return "b";
      case this.constants.S_IFCHR:
        return "c";
      case this.constants.S_IFSOCK:
        return "s";
      case this.constants.S_IFIFO:
        return "p";
    }
    return "f";
  }
}

interface Options {
  service: string;
  client?: Client;
  fs: (subject?: string) => Promise<Filesystem>;
  // project-id: if given, ONLY serve files for this one project, and the
  // path must be the home of the project
  // If not given, serves files for all projects.
  project_id?: string;
}

export async function fsServer({
  service,
  fs: fs0,
  client,
  project_id,
}: Options) {
  client ??= conat();
  const subject = project_id
    ? `${service}.project-${project_id}`
    : `${service}.*`;

  logger.debug("fsServer: ", { subject, service });

  const watches: { [subject: string]: any } = {};

  // It is extremely important to only have one copy of each
  // Filesystem for each subject, since ths Filesystem does
  // locking and coordination with clients.  Hence this cache,
  // given that fs(...) is called separately in all functions
  // below.  Any ttl cache is natural because this cache is used
  // for locks, which are short lived.
  const cache = new TTL<string, Filesystem>({ ttl: 60 * 1000 * 60 });
  const fs = reuseInFlight(async (subject) => {
    if (!cache.has(subject)) {
      cache.set(subject, await fs0(subject));
    }
    return cache.get(subject)!;
  });

  logger.debug("fsServer: starting subscription to ", subject);
  const sub = await client.service<Filesystem & { subject?: string }>(subject, {
    async appendFile(path: string, data: string | Buffer, encoding?) {
      await (await fs(this.subject)).appendFile(path, data, encoding);
    },
    async chmod(path: string, mode: string | number) {
      await (await fs(this.subject)).chmod(path, mode);
    },
    async constants(): Promise<{ [key: string]: number }> {
      return await (await fs(this.subject)).constants();
    },
    async copyFile(src: string, dest: string) {
      await (await fs(this.subject)).copyFile(src, dest);
    },
    async cp(src: string | string[], dest: string, options?) {
      await (await fs(this.subject)).cp(src, dest, options);
    },
    async dust(path: string, options?: DustOptions) {
      return await (await fs(this.subject)).dust(path, options);
    },
    async exists(path: string): Promise<boolean> {
      return await (await fs(this.subject)).exists(path);
    },
    async fd(path: string, options?: FdOptions) {
      return await (await fs(this.subject)).fd(path, options);
    },
    async find(path: string, options?: FindOptions) {
      return await (await fs(this.subject)).find(path, options);
    },
    async getListing(path: string) {
      return await (await fs(this.subject)).getListing(path);
    },
    async link(existingPath: string, newPath: string) {
      await (await fs(this.subject)).link(existingPath, newPath);
    },
    async lstat(path: string): Promise<IStats> {
      return await (await fs(this.subject)).lstat(path);
    },
    async mkdir(path: string, options?) {
      await (await fs(this.subject)).mkdir(path, options);
    },
    async ouch(args: string[], options?: OuchOptions) {
      return await (await fs(this.subject)).ouch(args, options);
    },
    async readFile(path: string, encoding?, lock?) {
      return await (await fs(this.subject)).readFile(path, encoding, lock);
    },
    async lockFile(path: string, lock?: number) {
      return await (await fs(this.subject)).lockFile(path, lock);
    },

    async readdir(path: string, options?) {
      const files = await (await fs(this.subject)).readdir(path, options);
      if (!options?.withFileTypes) {
        return files;
      }
      // Dirent - change the [Symbol(type)] field to something serializable so client can use this:
      return files.map((x) => {
        // @ts-ignore
        return { ...x, type: x[Object.getOwnPropertySymbols(x)[0]] };
      });
    },
    async readlink(path: string) {
      return await (await fs(this.subject)).readlink(path);
    },
    async realpath(path: string) {
      return await (await fs(this.subject)).realpath(path);
    },
    async rename(oldPath: string, newPath: string) {
      await (await fs(this.subject)).rename(oldPath, newPath);
    },
    async move(
      src: string | string[],
      dest: string,
      options?: { overwrite?: boolean },
    ) {
      return await (await fs(this.subject)).move(src, dest, options);
    },
    async ripgrep(path: string, pattern: string, options?: RipgrepOptions) {
      return await (await fs(this.subject)).ripgrep(path, pattern, options);
    },
    async rustic(args: string[]) {
      return await (await fs(this.subject)).rustic(args);
    },
    async rm(path: string | string[], options?) {
      await (await fs(this.subject)).rm(path, options);
    },
    async rmdir(path: string, options?) {
      await (await fs(this.subject)).rmdir(path, options);
    },
    async stat(path: string): Promise<IStats> {
      const s = await (await fs(this.subject)).stat(path);
      return {
        ...s,
        // for some reason these times get corrupted on transport from the nodejs datastructure,
        // so we make them standard Date objects.
        atime: new Date(s.atime),
        mtime: new Date(s.mtime),
        ctime: new Date(s.ctime),
        birthtime: new Date(s.birthtime),
      };
    },
    async symlink(target: string, path: string) {
      await (await fs(this.subject)).symlink(target, path);
    },
    async truncate(path: string, len?: number) {
      await (await fs(this.subject)).truncate(path, len);
    },
    async unlink(path: string) {
      await (await fs(this.subject)).unlink(path);
    },
    async utimes(
      path: string,
      atime: number | string | Date,
      mtime: number | string | Date,
    ) {
      await (await fs(this.subject)).utimes(path, atime, mtime);
    },
    async writeFile(
      path: string,
      data: string | Buffer | PatchWriteRequest,
      saveLast?: boolean,
    ) {
      await (await fs(this.subject)).writeFile(path, data, saveLast);
    },
    // @ts-ignore
    async watch() {
      const subject = this.subject!;
      if (watches[subject] != null) {
        return;
      }
      const f = await fs(subject);
      watches[subject] = watchServer({
        client,
        subject: `watch-${subject}`,
        watch: f.watch,
      });
    },
  });
  logger.debug("fsServer: created subscription to ", subject);

  return {
    close: () => {
      for (const subject in watches) {
        watches[subject].close();
        delete watches[subject];
      }
      sub.close();
    },
  };
}

export type FilesystemClient = Omit<Omit<Filesystem, "stat">, "lstat"> & {
  listing: (path: string) => Promise<Listing>;
  stat: (path: string) => Promise<Stats>;
  lstat: (path: string) => Promise<Stats>;
};

const PATCH_FALLBACK_CODES = new Set([
  "ETAG_MISMATCH",
  "PATCH_FAILED",
  "PATCH_TOO_LARGE",
  "EINVAL",
]);

async function writeFileDeltaImpl(
  writeFile: (
    path: string,
    data: string | Buffer | PatchWriteRequest,
    saveLast?: boolean,
  ) => Promise<void>,
  path: string,
  content: string | Buffer,
  options: WriteFileDeltaOptions = {},
): Promise<void> {
  const {
    baseContents,
    encoding = "utf8",
    maxPatchRatio = 2,
    saveLast,
  } = options;
  if (typeof content !== "string" || typeof baseContents !== "string") {
    await writeFile(path, content, saveLast);
    return;
  }

  if (baseContents === content) {
    return;
  }

  const patch = make_patch(baseContents, content);
  const serializedSize = JSON.stringify(patch).length;
  if (
    baseContents.length > 0 &&
    serializedSize > baseContents.length * maxPatchRatio
  ) {
    await writeFile(path, content, saveLast);
    return;
  }

  try {
    const sha = await sha256Hex(baseContents, encoding);
    await writeFile(
      path,
      {
        patch,
        sha256: sha,
        encoding,
        maxPatchRatio,
      },
      saveLast,
    );
    console.log("wrote using patch", patch);
  } catch (err: any) {
    if (!PATCH_FALLBACK_CODES.has(err?.code)) {
      throw err;
    }
    await writeFile(path, content, saveLast);
  }
}

async function sha256Hex(
  text: string,
  encoding: TextEncoding,
): Promise<string> {
  const normalized = encoding === "utf-8" ? "utf8" : encoding;
  if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const buffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return bufferToHex(new Uint8Array(buffer));
  }
  const nodeCrypto = await importNodeCrypto();
  if (!nodeCrypto) {
    throw new Error("SHA-256 not supported in this environment");
  }
  return nodeCrypto.createHash("sha256").update(text, normalized).digest("hex");
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importNodeCrypto(): Promise<
  | {
      createHash: (algorithm: string) => {
        update: (data: string, inputEncoding?: BufferEncoding) => any;
        digest: (encoding: "hex") => string;
      };
    }
  | undefined
> {
  if (typeof process === "undefined") {
    return undefined;
  }
  const proc: any = process;
  if (!proc?.versions?.node) {
    return undefined;
  }
  return (await import("crypto")) as any;
}

export function getService({
  compute_server_id,
  service = DEFAULT_FILE_SERVICE,
}: {
  compute_server_id?: number;
  service?: string;
}) {
  return compute_server_id ? `${service}/${compute_server_id}` : service;
}

export function fsSubject({
  project_id,
  compute_server_id = 0,
  service = DEFAULT_FILE_SERVICE,
}: {
  project_id: string;
  compute_server_id?: number;
  service?: string;
}) {
  if (!isValidUUID(project_id)) {
    throw Error(`project_id must be a valid uuid -- ${project_id}`);
  }
  if (typeof compute_server_id != "number") {
    throw Error("compute_server_id must be a number");
  }
  if (typeof service != "string") {
    throw Error("service must be a string");
  }
  return `${getService({ service, compute_server_id })}.project-${project_id}`;
}

const DEFAULT_FS_CALL_TIMEOUT = 5 * 60_000;

export function fsClient({
  client,
  subject,
  timeout = DEFAULT_FS_CALL_TIMEOUT,
}: {
  client?: Client;
  subject: string;
  timeout?: number;
}): FilesystemClient {
  client ??= conat();
  let call = client.call<FilesystemClient>(subject, { timeout });

  const readdir0 = call.readdir.bind(call);
  call.readdir = async (path: string, options?) => {
    const files = await readdir0(path, options);
    if (options?.withFileTypes) {
      return files.map((x) => new Dirent(x.name, x.parentPath, x.path, x.type));
    } else {
      return files;
    }
  };

  let constants: any = null;
  const stat0 = call.stat.bind(call);
  call.stat = async (path: string) => {
    const s = await stat0(path);
    constants = constants ?? (await call.constants());
    const stats = new Stats(constants);
    for (const k in s) {
      stats[k] = s[k];
    }
    return stats;
  };

  const lstat0 = call.lstat.bind(call);
  call.lstat = async (path: string) => {
    const s = await lstat0(path);
    constants = constants ?? (await call.constants());
    const stats = new Stats(constants);
    for (const k in s) {
      stats[k] = s[k];
    }
    return stats;
  };

  const ensureWatchServerExists = call.watch.bind(call);
  call.watch = async (path: string, options?) => {
    if (!(await call.exists(path))) {
      const err = new Error(
        `ENOENT: no such file or directory, watch '${path}'`,
      );
      // @ts-ignore
      err.code = "ENOENT";
      throw err;
    }
    await ensureWatchServerExists(path, options);
    return await watchClient({
      client,
      subject: `watch-${subject}`,
      path,
      options,
      fs: call,
    });
  };
  call.listing = async (path: string) => {
    return await listing({ fs: call, path });
  };

  call.writeFileDelta = async (
    path: string,
    content: string | Buffer,
    options?: WriteFileDeltaOptions,
  ) => {
    await writeFileDeltaImpl(call.writeFile, path, content, options);
  };

  return call;
}
