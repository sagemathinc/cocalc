/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Server directory listing through the HTTP server and Websocket API.

{files:[..., {size:?,name:?,mtime:?,isdir:?}]}

where mtime is integer SECONDS since epoch, size is in bytes, and isdir
is only there if true.

Obviously we should probably use POST instead of GET, due to the
result being a function of time... but POST is so complicated.
Use ?random= or ?time= if you're worried about cacheing.
Browser client code only uses this through the websocket anyways.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { Dirent, Stats } from "node:fs";
import { lstat, opendir, readdir, readlink, stat } from "node:fs/promises";
import { getLogger } from "./logger";
import { DirectoryListingEntry } from "@cocalc/util/types";
import { join } from "path";

const logger = getLogger("backend:directory-listing");

// SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
const HOME = process.env.SMC_LOCAL_HUB_HOME ?? process.env.HOME ?? "";

const getListing = reuseInFlight(
  async (
    path: string, // assumed in home directory!
    hidden: boolean = false,
    { home = HOME, limit }: { home?: string; limit?: number } = {},
  ): Promise<DirectoryListingEntry[]> => {
    const dir = join(home, path);
    logger.debug(dir);
    const files: DirectoryListingEntry[] = [];
    let file: Dirent;
    for await (file of await opendir(dir)) {
      if (limit && files.length >= limit) {
        break;
      }
      if (!hidden && file.name[0] === ".") {
        continue;
      }
      let entry: DirectoryListingEntry;
      try {
        // I don't actually know if file.name can fail to be JSON-able with node.js -- is there
        // even a string in Node.js that cannot be dumped to JSON?  With python
        // this definitely was a problem, but I can't find the examples now.  Users
        // sometimes create "insane" file names via bugs in C programs...
        JSON.stringify(file.name);
        entry = { name: file.name };
      } catch (err) {
        entry = { name: "????", error: "Cannot display bad binary filename. " };
      }

      try {
        let stats: Stats;
        if (file.isSymbolicLink()) {
          // Optimization: don't explicitly set issymlink if it is false
          entry.issymlink = true;
        }
        if (entry.issymlink) {
          // at least right now we only use this symlink stuff to display
          // information to the user in a listing, and nothing else.
          try {
            entry.link_target = await readlink(dir + "/" + entry.name);
          } catch (err) {
            // If we don't know the link target for some reason; just ignore this.
          }
        }
        try {
          stats = await stat(dir + "/" + entry.name);
        } catch (err) {
          // don't have access to target of link (or it is a broken link).
          stats = await lstat(dir + "/" + entry.name);
        }
        entry.mtime = stats.mtime.valueOf() / 1000;
        if (stats.isDirectory()) {
          entry.isdir = true;
          const v = await readdir(dir + "/" + entry.name);
          if (hidden) {
            entry.size = v.length;
          } else {
            // only count non-hidden files
            entry.size = 0;
            for (const x of v) {
              if (x[0] != ".") {
                entry.size += 1;
              }
            }
          }
        } else {
          entry.size = stats.size;
        }
      } catch (err) {
        entry.error = `${entry.error ? entry.error : ""}${err}`;
      }
      files.push(entry);
    }
    return files;
  },
);

export default getListing;
