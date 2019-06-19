/*
Render a public path
*/

// Do not backend render any file beyond this size, instead showing
// a download link.   This is to avoid a share server blocking for
// a long time or using a lot of RAM.
const MAX_SIZE_MB: number = 10;
const MAX_SIZE: number = 1000000 * MAX_SIZE_MB; // size in bytes

import * as os_path from "path";
import { stat, readFile } from "fs";
import { callback } from "awaiting";

import { filename_extension, field_cmp } from "smc-util/misc";

import { React } from "smc-webapp/app-framework";
import { PublicPath } from "smc-webapp/share/public-path";
import { DirectoryListing } from "smc-webapp/share/directory-listing";

import * as extensions from "smc-webapp/share/extensions";

import { get_listing } from "./listing";
import { redirect_to_directory } from "./util";
import { HostInfo } from "./public-paths";

export async function render_public_path(opts: {
  req: any;
  res: any; // html response object
  info?: HostInfo; // immutable.js info about the public share, if url starts with share id (as opposed to project_id)
  dir: string; // directory on disk containing files for this path
  react: any;
  path: string;
  viewer: string;
  hidden?: boolean;
  sort: string; // e.g., '-mtime' = sort files in reverse by timestamp
}): Promise<void> {
  const path_to_file = os_path.join(opts.dir, opts.path);

  function dbg(...args): void {
    console.log(`render_public_path('${path_to_file}')`, ...args);
  }
  dbg();

  let stats;
  try {
    stats = await callback(stat, path_to_file);
  } catch (err) {
    dbg("error", err);
    opts.res.sendStatus(404);
    return;
  }

  if (stats.isDirectory()) {
    dbg("is directory");
    if (opts.path.slice(-1) !== "/") {
      redirect_to_directory(opts.req, opts.res);
      return;
    }

    let files;
    try {
      files = await get_listing(path_to_file);
    } catch (err) {
      // TODO: show directory listing
      opts.res.send(`Error getting directory listing -- ${err}`);
      return;
    }
    let reverse: boolean;
    let sort: string;
    if (opts.sort[0] === "-") {
      reverse = true;
      sort = opts.sort.slice(1);
    } else {
      reverse = false;
      sort = opts.sort;
    }
    files.sort(field_cmp(sort));
    if (reverse) {
      files.reverse();
    }
    const C = React.createElement(DirectoryListing, {
      hidden: opts.hidden,
      info: opts.info as any, // typescript gets confused between two copies of immutable, breaking checking in this case.
      files: files,
      viewer: opts.viewer,
      path: opts.path
    });
    opts.react(opts.res, C, opts.path);
    return;
  }

  dbg("is file");
  let content: string | undefined = undefined;
  if (stats.size <= MAX_SIZE) {
    let ext = filename_extension(path_to_file);
    if (ext != null) ext = ext.toLowerCase();
    if (
      !(extensions.image[ext] || extensions.pdf[ext] || extensions.video[ext])
    ) {
      try {
        content = (await callback(readFile, path_to_file)).toString();
      } catch (err) {
        opts.res.sendStatus(404);
        return;
      }
    }
  }

  const component = React.createElement(PublicPath, {
    info: opts.info as any, // see comment where this is done above.
    content,
    viewer: opts.viewer,
    path: opts.path,
    size: stats.size,
    max_size: MAX_SIZE
  });

  opts.react(opts.res, component, opts.path);
}
