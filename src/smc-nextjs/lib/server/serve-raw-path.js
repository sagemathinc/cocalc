/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a public path using the express static server.
*/

const fs = require("fs");
const os_path = require("path");
const url = require("url");
const serve_static = require("serve-static");
const serve_index = require("serve-index");
const finalhandler = require("finalhandler");

// TODO: redo using LRU caches.
const STATIC_OPTIONS = { index: ["index.html", "index.htm"] };
const serve_static_cache = {};
function get_serve_static(dir) {
  return serve_static_cache[dir] != null
    ? serve_static_cache[dir]
    : (serve_static_cache[dir] = serve_static(dir, STATIC_OPTIONS));
}

const INDEX_OPTIONS = { icons: true };
const serve_index_cache = {};
function get_serve_index(dir) {
  return serve_index_cache[dir] != null
    ? serve_index_cache[dir]
    : (serve_index_cache[dir] = serve_index(dir, INDEX_OPTIONS));
}

// res = html response object
module.exports = function serveRawPath(opts) {
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
    const s_static = get_serve_static(dir);
    const s_index = get_serve_index(dir);
    req.url = path === "" ? "/" : path;
    s_static(req, res, function (err) {
      if (err) {
        finalhandler(err);
      } else {
        s_index(req, res, finalhandler);
      }
    });
  });
};
