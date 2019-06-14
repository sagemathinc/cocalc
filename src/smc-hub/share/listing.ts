/*
Utilities that are useful for getting directory listings.
*/

import { lstat, readdir } from "fs";
import { mapLimit } from "async";

interface FileInfo {
  name: string;
  error?: Error;
  isdir?: boolean;
  size?: number;
  mtime?: number;
}

export function get_listing(dir: string, cb: Function): void {
  readdir(
    dir,
    (err, files: string[]): void => {
      if (err) {
        cb(err);
        return;
      }
      // Do NOT filter hidden files (why would we? -- github doesn't)
      //# files = (fn for fn in files when fn.charAt(0) isnt '.')
      function get_metadata(file: string, cb: Function): void {
        const obj: FileInfo = { name: file };
        // use lstat instead of stat so it works on symlinks too
        lstat(dir + "/" + file, function(err, stats) {
          if (err) {
            obj.error = err;
          } else {
            if (stats.isDirectory()) {
              obj.isdir = true;
            } else {
              obj.size = stats.size;
            }
            obj.mtime = Math.floor(stats.mtime.valueOf() / 1000);
          }
          cb(undefined, obj);
        });
      }
      mapLimit(files, 10, get_metadata, cb);
    }
  );
}

export function render_directory_listing(
  data: FileInfo[],
  info: { project_id: string; path: string }
): string {
  const s = ["<a href='..'>..</a>"];
  for (let obj of data) {
    let { name } = obj;
    let link = encodeURIComponent(name);
    if (obj.isdir) {
      link += "/";
      name += "/";
    }
    s.push(`<a style='text-decoration:none' href='${link}'>${name}</a>`);
  }
  const body = s.join("<br/>");
  return `<body style='margin:40px'><h2>${info.project_id}:${
    info.path
  }</h2>${body}</body>`;
}
