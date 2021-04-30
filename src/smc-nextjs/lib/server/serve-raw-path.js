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

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.write("404 Not Found\n");
  res.end();
}

// res = html response object
module.exports = async function serveRawPath(opts) {
  const { req, res, sharePath, path } = opts;
  // see https://stackoverflow.com/questions/14166898/node-js-with-express-how-to-remove-the-query-string-from-the-url
  const pathname = url.parse(path).pathname;
  if (pathname == null) {
    // console.log("serveRawPath", err);
    send404(res);
    return;
  }

  // We first test that we have access to the file (and it exists)
  // before serving the file, to avoid the static server itself
  // failing internally (which does so in a bad way).
  // Also, if the share target is a directory, then the url
  // to acccess it is
  //     /raw/[share_id]/path/into/the/share.
  // but if the share target is a file, the url is
  //     /raw/[share_id]/[shared_filename].
  // We do this because otherwise the browser/server wouldn't know the MIME type,
  // but at the same time we want to minimize how much redundant information
  // is in the URL.   In our actual implementation in the later case (not a directory),
  // we immediately send an error if the shared_filename doesn't match the
  // last segment of the shared_id's path.
  let stats, target, dir;
  try {
    stats = await fs.promises.lstat(sharePath);
    if (stats.isDirectory()) {
      target = os_path.join(sharePath, decodeURI(pathname));
      dir = sharePath;
    } else {
      target = sharePath;
      const i = sharePath.lastIndexOf("/");
      dir = sharePath.slice(0, i);
      if (decodeURI(pathname) != sharePath.slice(i + 1)) {
        send404(res);
        return;
      }
    }
    await fs.promises.access(target, fs.constants.R_OK);
  } catch (err) {
    // console.log("serveRawPath", err, { target });
    send404(res);
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
};
