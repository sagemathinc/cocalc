import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import {
  watchServer,
  watchClient,
  type WatchIterator,
} from "@cocalc/conat/files/watch";
export const DEFAULT_FILE_SERVICE = "fs";

export interface FindOptions {
  // timeout is very limited (e.g., 3s?) if fs is running on file
  // server (not in own project)
  timeout?: number;
  // recursive is false by default (unlike actual find command)
  recursive?: boolean;
  // see typing below -- we can't just pass arbitrary args since
  // that would not be secure.
  expression?: FindExpression;
}

export type FindExpression =
  | { type: "name"; pattern: string }
  | { type: "iname"; pattern: string }
  | { type: "type"; value: "f" | "d" | "l" }
  | { type: "size"; operator: "+" | "-"; value: string }
  | { type: "mtime"; operator: "+" | "-"; days: number }
  | { type: "newer"; file: string }
  | { type: "and"; left: FindExpression; right: FindExpression }
  | { type: "or"; left: FindExpression; right: FindExpression }
  | { type: "not"; expr: FindExpression };

export interface Filesystem {
  appendFile: (path: string, data: string | Buffer, encoding?) => Promise<void>;
  chmod: (path: string, mode: string | number) => Promise<void>;
  constants: () => Promise<{ [key: string]: number }>;
  copyFile: (src: string, dest: string) => Promise<void>;
  cp: (src: string, dest: string, options?) => Promise<void>;
  exists: (path: string) => Promise<void>;
  link: (existingPath: string, newPath: string) => Promise<void>;
  lstat: (path: string) => Promise<IStats>;
  mkdir: (path: string, options?) => Promise<void>;
  readFile: (path: string, encoding?: any) => Promise<string | Buffer>;
  readdir: (path: string) => Promise<string[]>;
  realpath: (path: string) => Promise<string>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options?) => Promise<void>;
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
  writeFile: (path: string, data: string | Buffer) => Promise<void>;
  // todo: typing
  watch: (path: string, options?) => Promise<WatchIterator>;

  // We add very little to the Filesystem api, but we have to add
  // a sandboxed "find" command, since it is a 1-call way to get
  // arbitrary directory listing info, which is just not possible
  // with the fs API, but required in any serious application.
  // find -P {path} -maxdepth 1 -mindepth 1 -printf {printf}
  find: (
    path: string,
    printf: string,
    options?: FindOptions,
  ) => Promise<{ stdout: Buffer; truncated: boolean }>;
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

class Stats {
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
}

interface Options {
  service: string;
  client?: Client;
  fs: (subject?: string) => Promise<Filesystem>;
}

export async function fsServer({ service, fs, client }: Options) {
  client ??= conat();
  const subject = `${service}.*`;
  const watches: { [subject: string]: any } = {};
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
    async cp(src: string, dest: string, options?) {
      await (await fs(this.subject)).cp(src, dest, options);
    },
    async exists(path: string) {
      return await (await fs(this.subject)).exists(path);
    },
    async find(path: string, printf: string, options?: FindOptions) {
      return await (await fs(this.subject)).find(path, printf, options);
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
    async readFile(path: string, encoding?) {
      return await (await fs(this.subject)).readFile(path, encoding);
    },
    async readdir(path: string) {
      return await (await fs(this.subject)).readdir(path);
    },
    async realpath(path: string) {
      return await (await fs(this.subject)).realpath(path);
    },
    async rename(oldPath: string, newPath: string) {
      await (await fs(this.subject)).rename(oldPath, newPath);
    },
    async rm(path: string, options?) {
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
    async writeFile(path: string, data: string | Buffer) {
      await (await fs(this.subject)).writeFile(path, data);
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
        subject: subject!,
        watch: f.watch,
      });
    },
  });
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

export function fsClient({
  client,
  subject,
}: {
  client?: Client;
  subject: string;
}): Filesystem {
  client ??= conat();
  let call = client.call<Filesystem>(subject);

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
    await ensureWatchServerExists(path, options);
    return await watchClient({ client, subject, path, options });
  };

  return call;
}
