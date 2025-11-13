import {
  appendFile,
  chmod,
  cp,
  copyFile,
  link,
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
  watch,
} from "node:fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { type DirectoryListingEntry } from "@cocalc/util/types";
import getListing from "@cocalc/backend/get-listing";
import { type Subvolume } from "./subvolume";
import { isdir, sudo } from "./util";

export class SubvolumeFilesystem {
  constructor(private subvolume: Subvolume) {}

  private normalize = this.subvolume.normalize;

  ls = async (
    path: string,
    { hidden, limit }: { hidden?: boolean; limit?: number } = {},
  ): Promise<DirectoryListingEntry[]> => {
    return await getListing(this.normalize(path), hidden, {
      limit,
      home: "/",
    });
  };

  readFile = async (path: string, encoding?: any): Promise<string | Buffer> => {
    return await readFile(this.normalize(path), encoding);
  };

  writeFile = async (path: string, data: string | Buffer) => {
    return await writeFile(this.normalize(path), data);
  };

  appendFile = async (path: string, data: string | Buffer, encoding?) => {
    return await appendFile(this.normalize(path), data, encoding);
  };

  unlink = async (path: string) => {
    await unlink(this.normalize(path));
  };

  stat = async (path: string) => {
    return await stat(this.normalize(path));
  };

  exists = async (path: string) => {
    return await exists(this.normalize(path));
  };

  // hard link
  link = async (existingPath: string, newPath: string) => {
    return await link(this.normalize(existingPath), this.normalize(newPath));
  };

  symlink = async (target: string, path: string) => {
    return await symlink(this.normalize(target), this.normalize(path));
  };

  realpath = async (path: string) => {
    const x = await realpath(this.normalize(path));
    return x.slice(this.subvolume.path.length + 1);
  };

  rename = async (oldPath: string, newPath: string) => {
    await rename(this.normalize(oldPath), this.normalize(newPath));
  };

  utimes = async (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => {
    await utimes(this.normalize(path), atime, mtime);
  };

  watch = (filename: string, options?) => {
    return watch(this.normalize(filename), options);
  };

  truncate = async (path: string, len?: number) => {
    await truncate(this.normalize(path), len);
  };

  copyFile = async (src: string, dest: string) => {
    await copyFile(this.normalize(src), this.normalize(dest));
  };

  cp = async (src: string, dest: string, options?) => {
    await cp(this.normalize(src), this.normalize(dest), options);
  };

  chmod = async (path: string, mode: string | number) => {
    await chmod(this.normalize(path), mode);
  };

  mkdir = async (path: string, options?) => {
    await mkdir(this.normalize(path), options);
  };

  rsync = async ({
    src,
    target,
    args = ["-axH"],
    timeout = 5 * 60 * 1000,
  }: {
    src: string;
    target: string;
    args?: string[];
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exit_code: number }> => {
    let srcPath = this.normalize(src);
    let targetPath = this.normalize(target);
    if (!srcPath.endsWith("/") && (await isdir(srcPath))) {
      srcPath += "/";
      if (!targetPath.endsWith("/")) {
        targetPath += "/";
      }
    }
    return await sudo({
      command: "rsync",
      args: [...args, srcPath, targetPath],
      err_on_exit: false,
      timeout: timeout / 1000,
    });
  };

  rmdir = async (path: string, options?) => {
    await rmdir(this.normalize(path), options);
  };

  rm = async (path: string, options?) => {
    await rm(this.normalize(path), options);
  };
}
