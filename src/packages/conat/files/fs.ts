import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";

export interface Filesystem {
  appendFile: (path: string, data: string | Buffer, encoding?) => Promise<void>;
  chmod: (path: string, mode: string | number) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  cp: (src: string, dest: string, options?) => Promise<void>;
  exists: (path: string) => Promise<void>;
  link: (existingPath: string, newPath: string) => Promise<void>;
  mkdir: (path: string, options?) => Promise<void>;
  readFile: (path: string, encoding?: any) => Promise<string | Buffer>;
  readdir: (path: string) => Promise<string[]>;
  realpath: (path: string) => Promise<string>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options?) => Promise<void>;
  rmdir: (path: string, options?) => Promise<void>;
  stat: (path: string) => Promise<Stats>;
  symlink: (target: string, path: string) => Promise<void>;
  truncate: (path: string, len?: number) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  utimes: (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => Promise<void>;
  writeFile: (path: string, data: string | Buffer) => Promise<void>;
}

export interface Stats {
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

interface Options {
  service: string;
  client?: Client;
  fs: (subject?: string) => Promise<Filesystem>;
}

export async function fsServer({ service, fs, client }: Options) {
  return await (client ?? conat()).service<Filesystem & { subject?: string }>(
    `${service}.*`,
    {
      async appendFile(path: string, data: string | Buffer, encoding?) {
        await (await fs(this.subject)).appendFile(path, data, encoding);
      },
      async chmod(path: string, mode: string | number) {
        await (await fs(this.subject)).chmod(path, mode);
      },
      async copyFile(src: string, dest: string) {
        await (await fs(this.subject)).copyFile(src, dest);
      },
      async cp(src: string, dest: string, options?) {
        await (await fs(this.subject)).cp(src, dest, options);
      },
      async exists(path: string) {
        await (await fs(this.subject)).exists(path);
      },
      async link(existingPath: string, newPath: string) {
        await (await fs(this.subject)).link(existingPath, newPath);
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
        return await (await fs(this.subject)).rename(oldPath, newPath);
      },
      async rm(path: string, options?) {
        return await (await fs(this.subject)).rm(path, options);
      },
      async rmdir(path: string, options?) {
        return await (await fs(this.subject)).rmdir(path, options);
      },
      async stat(path: string): Promise<Stats> {
        return await (await fs(this.subject)).stat(path);
      },
      async symlink(target: string, path: string) {
        return await (await fs(this.subject)).symlink(target, path);
      },
      async truncate(path: string, len?: number) {
        return await (await fs(this.subject)).truncate(path, len);
      },
      async unlink(path: string) {
        return await (await fs(this.subject)).unlink(path);
      },
      async utimes(
        path: string,
        atime: number | string | Date,
        mtime: number | string | Date,
      ) {
        return await (await fs(this.subject)).utimes(path, atime, mtime);
      },
      async writeFile(path: string, data: string | Buffer) {
        return await (await fs(this.subject)).writeFile(path, data);
      },
    },
  );
}

export function fsClient({
  client,
  subject,
}: {
  client?: Client;
  subject: string;
}) {
  return (client ?? conat()).call<Filesystem>(subject);
}
