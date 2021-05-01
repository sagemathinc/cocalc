/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import pathToFiles from "lib/path-to-files";
import { promises as fs } from "fs";
import { join } from "path";
import { sortBy } from "lodash";
import { hasSpecialViewer } from "lib/file-extensions";
import { getExtension } from "lib/util";

export interface FileInfo {
  name: string;
  error?: Error;
  isdir?: boolean;
  size?: number;
  mtime?: number;
}

export interface PathContents {
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  size?: number;
  mtime?: number;
}

export default async function getContents(
  project_id: string,
  path: string
): Promise<PathContents> {
  const fsPath = pathToFiles(project_id, path);
  const obj: PathContents = {};

  // use lstat instead of stat so it works on symlinks too
  const stats = await fs.lstat(fsPath);
  obj.isdir = stats.isDirectory();
  obj.mtime = stats.mtime.valueOf();
  if (obj.isdir) {
    // get listing
    obj.listing = await getDirectoryListing(fsPath);
  } else {
    // get actual file content
    // TODO: deal with large files and binary files, obviously.
    // See smc-hub/share/render-public-path.ts where this is solved.
    if (hasSpecialViewer(getExtension(fsPath))) {
      obj.content = (await fs.readFile(fsPath)).toString();
    }
    obj.size = stats.size;
  }
  return obj;
}

async function getDirectoryListing(path: string): Promise<FileInfo[]> {
  const listing: FileInfo[] = [];
  for (const name of await fs.readdir(path)) {
    const obj: FileInfo = { name };
    // use lstat instead of stat so it works on symlinks too
    try {
      const stats = await fs.lstat(join(path, name));
      if (stats.isDirectory()) {
        obj.isdir = true;
      } else {
        obj.size = stats.size;
      }
      obj.mtime = stats.mtime.valueOf();
    } catch (err) {
      obj.error = err;
    }
    listing.push(obj);
  }
  return sortBy(listing, ['name']);
}
