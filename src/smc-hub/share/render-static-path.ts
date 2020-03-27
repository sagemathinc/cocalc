/*
Render a public path using the express static server.
*/

import * as fs from "fs";
import * as os_path from "path";

import * as url from "url";
import * as serve_static from "serve-static";
import * as serve_index from "serve-index";
import * as finalhandler from "finalhandler";

const STATIC_OPTIONS = { index: ["index.html", "index.htm"] };

const INDEX_OPTIONS = { icons: true };

// NOTE: we never clear these caches.  However, there is at most one for
// every public_path, so it probably wastes very little memory.  Someday
// should change to an LRU cache...

const serve_static_cache: { [dir: string]: Function } = {};
function get_serve_static(dir: string): Function {
  return serve_static_cache[dir] != null
    ? serve_static_cache[dir]
    : (serve_static_cache[dir] = serve_static(dir, STATIC_OPTIONS));
}

const serve_index_cache: { [dir: string]: Function } = {};
function get_serve_index(dir: string): Function {
  return serve_index_cache[dir] != null
    ? serve_index_cache[dir]
    : (serve_index_cache[dir] = serve_index(dir, INDEX_OPTIONS));
}

// res = html response object
export function render_static_path(opts: {
  req: any;
  res: any;
  dir: string;
  path: string;
}): void {
  // We first test that we have access to the file (and it exists) before
  // messing with the express static server.  I don't know why, but for some
  // reason it hangs forever when fed an unknown path, which obviously leads
  // to a very bad experience for users!
  const { req, res, dir, path } = opts;
  // see https://stackoverflow.com/questions/14166898/node-js-with-express-how-to-remove-the-query-string-from-the-url
  const pathname = url.parse(path).pathname;
  if (pathname == null) {
    // I think this shouldn't be possible, but typescript thinks it is.
    res.sendStatus(404);
    return;
  }
  const target = os_path.join(dir, decodeURI(pathname));
  fs.access(target, fs.constants.R_OK, function (err) {
    if (err != null) {
      res.sendStatus(404);
      return;
    }
    const s_static: Function = get_serve_static(dir);
    const s_index: Function = get_serve_index(dir);
    req.url = path === "" ? "/" : path;
    s_static(req, res, function (err) {
      if (err) {
        finalhandler(err);
      } else {
        s_index(req, res, finalhandler);
      }
    });
  });
}
