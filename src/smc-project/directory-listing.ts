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

import { lstat, stat, readdir, Dirent, Stats } from "fs";

import { callback } from "awaiting";

// SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
const HOME =
  process.env.SMC_LOCAL_HUB_HOME != null
    ? process.env.SMC_LOCAL_HUB_HOME
    : process.env.HOME;

export interface ListingEntry {
  name: string;
  isdir?: boolean;
  size?: number; // bytes for file, number of entries for directory (*including* . and ..).
  mtime?: number;
  error?: string;
}

// Switch to this once we switch to node10, which has the withFileTypes option.
// TEST FIRST!
export async function get_listing_node10(
  path: string,
  hidden: boolean = false
): Promise<ListingEntry[]> {
  const dir = HOME + "/" + path;
  const files: ListingEntry[] = [];
  let file: Dirent;
  for (file of await callback(readdir, { withFileTypes: true }, dir)) {
    if (!hidden && file.name[0] === ".") {
      continue;
    }
    let entry: ListingEntry;
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

    if (file.isDirectory()) {
      entry.isdir = true;
    }

    try {
      let stats: Stats;
      if (file.isSymbolicLink()) {
        stats = await callback(lstat, dir + "/" + entry.name);
      } else {
        stats = await callback(stat, dir + "/" + entry.name);
      }
      entry.size = stats.size;
      entry.mtime = stats.mtime.valueOf() / 1000;
    } catch (err) {
      entry.error = `${entry.error ? entry.error : ""}${err}`;
    }
    files.push(entry);
  }
  return files;
}

export async function get_listing(
  path: string,
  hidden: boolean = false
): Promise<ListingEntry[]> {
  const dir = HOME + "/" + path;
  const files: ListingEntry[] = [];
  let name: string;
  for (name of await callback(readdir, dir)) {
    if (!hidden && name[0] === ".") {
      continue;
    }
    let entry: ListingEntry;
    try {
      // I don't actually know if file can fail to be JSON-able with node.js -- is there
      // even a string in Node.js that cannot be dumped to JSON?  With python
      // this definitely was a problem, but I can't find the examples now.  Users
      // sometimes create "insane" file names via bugs in C programs...
      JSON.stringify(name);
      entry = { name };
    } catch (err) {
      entry = { name: "????", error: "Cannot display bad binary filename. " };
    }

    try {
      let stats: Stats;
      try {
        stats = await callback(stat, dir + "/" + entry.name);
      } catch (err) {
        stats = await callback(lstat, dir + "/" + entry.name);
      }
      entry.size = stats.size;
      entry.mtime = stats.mtime.valueOf() / 1000;
      if (stats.isDirectory()) {
        entry.isdir = true;
      }
    } catch (err) {
      entry.error = `${entry.error ? entry.error : ""}${err}`;
    }
    files.push(entry);
  }
  return files;
}

export function directory_listing_router(express): any {
  const base = "/.smc/directory_listing/";
  const router = express.Router();
  return directory_listing_http_server(base, router);
}

function directory_listing_http_server(base, router): void {
  router.get(base + "*", async function(req, res) {
    // decodeURIComponent because decodeURI(misc.encode_path('asdf/te #1/')) != 'asdf/te #1/'
    // https://github.com/sagemathinc/cocalc/issues/2400
    const path = decodeURIComponent(req.path.slice(base.length).trim());
    const { hidden } = req.query;
    // Fast -- do directly in this process.
    try {
      const files = await get_listing(path, hidden);
      res.json({ files });
    } catch (err) {
      res.json({ error: `${err}` });
    }
  });

  return router;
}
