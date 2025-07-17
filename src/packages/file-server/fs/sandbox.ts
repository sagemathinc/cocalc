/*
Given a path to a folder on the filesystem, this provides
a wrapper class with an API similar to the fs/promises modules,
but which only allows access to files in that folder.
It's a bit simpler with return data that is always
serializable.

Absolute and relative paths are considered as relative to the input folder path.

REFERENCE: We don't use https://github.com/metarhia/sandboxed-fs, but did
look at the code.
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
  watch,
} from "node:fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { type DirectoryListingEntry } from "@cocalc/util/types";
import getListing from "@cocalc/backend/get-listing";
import { join, resolve } from "path";

export class SandboxedFilesystem {
  // path should be the path to a FOLDER on the filesystem (not a file)
  constructor(public readonly path: string) {}

  safeAbsPath = (path: string) => {
    if (typeof path != "string") {
      throw Error(`path must be a string but is of type ${typeof path}`);
    }
    return join(this.path, resolve("/", path));
  };

  appendFile = async (path: string, data: string | Buffer, encoding?) => {
    return await appendFile(this.safeAbsPath(path), data, encoding);
  };

  chmod = async (path: string, mode: string | number) => {
    await chmod(this.safeAbsPath(path), mode);
  };

  constants = async (): Promise<{ [key: string]: number }> => {
    return constants;
  };

  copyFile = async (src: string, dest: string) => {
    await copyFile(this.safeAbsPath(src), this.safeAbsPath(dest));
  };

  cp = async (src: string, dest: string, options?) => {
    await cp(this.safeAbsPath(src), this.safeAbsPath(dest), options);
  };

  exists = async (path: string) => {
    return await exists(this.safeAbsPath(path));
  };

  // hard link
  link = async (existingPath: string, newPath: string) => {
    return await link(
      this.safeAbsPath(existingPath),
      this.safeAbsPath(newPath),
    );
  };

  ls = async (
    path: string,
    { hidden, limit }: { hidden?: boolean; limit?: number } = {},
  ): Promise<DirectoryListingEntry[]> => {
    return await getListing(this.safeAbsPath(path), hidden, {
      limit,
      home: "/",
    });
  };

  lstat = async (path: string) => {
    return await lstat(this.safeAbsPath(path));
  };

  mkdir = async (path: string, options?) => {
    await mkdir(this.safeAbsPath(path), options);
  };

  readFile = async (path: string, encoding?: any): Promise<string | Buffer> => {
    return await readFile(this.safeAbsPath(path), encoding);
  };

  readdir = async (path: string): Promise<string[]> => {
    return await readdir(this.safeAbsPath(path));
  };

  realpath = async (path: string): Promise<string> => {
    const x = await realpath(this.safeAbsPath(path));
    return x.slice(this.path.length + 1);
  };

  rename = async (oldPath: string, newPath: string) => {
    await rename(this.safeAbsPath(oldPath), this.safeAbsPath(newPath));
  };

  rm = async (path: string, options?) => {
    await rm(this.safeAbsPath(path), options);
  };

  rmdir = async (path: string, options?) => {
    await rmdir(this.safeAbsPath(path), options);
  };

  stat = async (path: string) => {
    return await stat(this.safeAbsPath(path));
  };

  symlink = async (target: string, path: string) => {
    return await symlink(this.safeAbsPath(target), this.safeAbsPath(path));
  };

  truncate = async (path: string, len?: number) => {
    await truncate(this.safeAbsPath(path), len);
  };

  unlink = async (path: string) => {
    await unlink(this.safeAbsPath(path));
  };

  utimes = async (
    path: string,
    atime: number | string | Date,
    mtime: number | string | Date,
  ) => {
    await utimes(this.safeAbsPath(path), atime, mtime);
  };

  watch = (filename: string, options?) => {
    return watch(this.safeAbsPath(filename), options);
  };

  writeFile = async (path: string, data: string | Buffer) => {
    return await writeFile(this.safeAbsPath(path), data);
  };
}
