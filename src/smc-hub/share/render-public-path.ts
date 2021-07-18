/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a public path
*/

// Do not backend render any file beyond this size, instead showing
// a download link.   This is to avoid a share server blocking for
// a long time or using a lot of RAM.
const MB: number = 1000000;
const MAX_SIZE_MB: number = 10;

// I want to raise this, but right now our Markdown and HTML renderers
// are VERY slow on big files:
const MAX_SIZE_HIGHLIGHT_MB: number = 0.5;

import * as os_path from "path";
import { stat, readFile } from "fs";
import { callback } from "awaiting";

import { field_cmp, filename_extension, path_to_title } from "smc-util/misc";

import { React } from "smc-webapp/app-framework";
import { PublicPath } from "smc-webapp/share/public-path";
import { has_viewer, needs_content } from "smc-webapp/share/file-contents";
import { DirectoryListing } from "smc-webapp/share/directory-listing";
import { Author } from "smc-webapp/share/types";
import { get_listing } from "./listing";
import { redirect_to_directory } from "./util";
import { HostInfo } from "./public-paths";
import base_path from "smc-util-node/base-path";

export async function render_public_path(opts: {
  req: any;
  res: any; // html response object
  info?: HostInfo; // immutable.js info about the public share, if url starts with share id (as opposed to project_id)
  dir: string; // directory on disk containing files for this path
  react: Function;
  path: string;
  viewer: string;
  hidden?: boolean;
  sort: string; // e.g., '-mtime' = sort files in reverse by timestamp
  authors: Author[];
  views?: number;
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
    const component = React.createElement(DirectoryListing, {
      hidden: opts.hidden,
      info: opts.info as any, // typescript gets confused between two copies of immutable, breaking checking in this case.
      files: files,
      viewer: opts.viewer,
      path: opts.path,
      views: opts.views,
      base_path,
    });
    // NOTE: last true is because we never index directory listings -- instead we want
    // users to find specific files by their content and name
    opts.react(opts.res, component, opts.path, true);
    return;
  }

  dbg("is file");
  let noindex: boolean;
  if (opts.viewer == "share") {
    // do index a file if we will be showing it via the share server.
    noindex = false;
  } else {
    noindex = true; // never index content that is raw or embedded
  }

  let why: string | undefined = undefined;
  let content: string | undefined = undefined;
  let ext = filename_extension(path_to_file);
  if (ext != null) ext = ext.toLowerCase();
  if (!has_viewer(ext)) {
    why = "We do not have a way to display this file.";
  } else if (stats.size > MAX_SIZE_MB * MB) {
    why = "File too big to be shown.";
  } else {
    if (needs_content(ext)) {
      try {
        content = (await callback(readFile, path_to_file)).toString();
      } catch (err) {
        opts.res.sendStatus(404);
        return;
      }
    } else {
      content = "";
    }
  }

  let highlight: boolean;
  if (ext == "ipynb") {
    // ipynb files tend to be very large, but still easy to render, due to images.
    // This is a little dangerous though! We will eventually need to do something
    // maybe async with a timeout...
    highlight = true;
  } else {
    highlight = stats.size < MAX_SIZE_HIGHLIGHT_MB * MB;
  }

  const component = React.createElement(PublicPath, {
    info: opts.info as any, // see comment where this is done above.
    content,
    viewer: opts.viewer,
    path: opts.path,
    why,
    size: stats.size,
    highlight,
    authors: opts.authors,
    base_path,
    views: opts.views,
  });
  const subtitle = path_to_title(opts.path);
  opts.react(opts.res, component, subtitle, noindex);
}
