/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Utilities that are useful for getting directory listings.
*/

import { lstat, readdir } from "fs";
import { callback, map } from "awaiting";

interface FileInfo {
  name: string;
  error?: Error;
  isdir?: boolean;
  size?: number;
  mtime?: number;
}

export async function get_listing(dir: string): Promise<FileInfo[]> {
  const files: string[] = await callback(readdir, dir);
  async function get_metadata(file: string): Promise<FileInfo> {
    const obj: FileInfo = { name: file };
    // use lstat instead of stat so it works on symlinks too
    try {
      const stats = await callback(lstat, dir + "/" + file);
      if (stats.isDirectory()) {
        obj.isdir = true;
      } else {
        obj.size = stats.size;
      }
      obj.mtime = Math.floor(stats.mtime.valueOf() / 1000);
    } catch (err) {
      obj.error = err;
    }
    return obj;
  }
  return await map(files, 10, get_metadata);
}

export function render_directory_listing(
  data: FileInfo[],
  info: { project_id: string; path: string }
): string {
  const s = ["<a href='..'>..</a>"];
  for (const obj of data) {
    let { name } = obj;
    let link = encodeURIComponent(name);
    if (obj.isdir) {
      link += "/";
      name += "/";
    }
    s.push(`<a style='text-decoration:none' href='${link}'>${name}</a>`);
  }
  const body = s.join("<br/>");
  return `<body style='margin:40px'><h2>${info.project_id}:${info.path}</h2>${body}</body>`;
}
