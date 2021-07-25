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
const LRU = require("lru-cache");
const { sortBy } = require("lodash");

const CACHE_SIZE = 100;
const STATIC_OPTIONS = {
  index: ["index.html", "index.htm"],
  dotfiles: "allow",
  fallthrough: true,
};
const staticServers = new LRU({ max: CACHE_SIZE });
function getStaticServer(dir) {
  if (staticServers.has(dir)) {
    return staticServers.get(dir);
  }
  const server = serve_static(dir, STATIC_OPTIONS);
  staticServers.set(dir, server);
  return server;
}

// TODO: make this look nice/consistent...?  Maybe also include timestamp and filesize.
function template(locals, cb) {
  // see https://www.npmjs.com/package/serve-index
  const { directory, fileList, path } = locals;
  let page = `<div style="color: #555;margin: 0 auto;max-width: 1200px;font-size: 12pt;"><h2>${directory}</h2>`;
  for (const file of sortBy(fileList, ["name"])) {
    const { name, stat } = file;
    const isDir = stat.isDirectory();
    page += `<div style="height:1.5em"><a style="text-decoration: none" href="${
      name + (isDir ? "/" : "")
    }">${isDir ? `<b>${name}</b>` : name}</a></div>`;
  }
  page += "</div>";
  cb(undefined, page);
}
const INDEX_OPTIONS = { hidden: true, template };
const indexServers = new LRU({ max: CACHE_SIZE });
function getIndexServer(dir) {
  if (indexServers.has(dir)) {
    return indexServers.get(dir);
  }
  const server = serve_index(dir, INDEX_OPTIONS);
  indexServers.set(dir, server);
  return server;
}

function send404(res, err) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.write(`404 Not Found\n${err}`);
  res.end();
}

// res = html response object
module.exports = async function serveRawPath(opts) {
  const { req, res, sharePath, path, download } = opts;
  // see https://stackoverflow.com/questions/14166898/node-js-with-express-how-to-remove-the-query-string-from-the-url
  let pathname = url.parse(path).pathname;
  if (pathname == null) {
    // This happens when getting directory listing for entire public path.
    pathname = "";
  }

  // We first test that we have access to the file (and it exists)
  // before serving the file, to avoid the static server itself
  // failing internally (which does so in a bad way, due to fallthrough: true,
  // since we want to serve an index in that case).
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
  let stats, target, dir, targetIsDir;
  try {
    stats = await fs.promises.lstat(sharePath);
    if (stats.isDirectory()) {
      target = os_path.join(sharePath, decodePath(pathname));
      dir = sharePath;
    } else {
      target = sharePath;
      const i = sharePath.lastIndexOf("/");
      dir = sharePath.slice(0, i);
      if (decodePath(pathname) != sharePath.slice(i + 1)) {
        send404(res, "Invalid path");
        return;
      }
    }
    // This lstat both determines it is a directory *and* checks that it is readable.
    targetIsDir = (
      await fs.promises.lstat(target, fs.constants.R_OK)
    ).isDirectory();
    if (targetIsDir && download) {
      throw Error("only files can be downloaded"); // TODO: we could implement directories somehow (zip and stream?)
    }
  } catch (err) {
    // console.log("serveRawPath", err, { target });
    send404(res, err);
    return;
  }

  if (download) {
    // download file to browser
    const stream = fs.createReadStream(target);
    const i = target.lastIndexOf("/");
    res.writeHead(200, { "Content-disposition": "attachment" });
    stream.pipe(res);
    return;
  }

  const staticServer = getStaticServer(dir);
  const orig_url = req.url;
  req.url = path === "" ? "/" : path;
  staticServer(req, res, function (err) {
    if (err) {
      finalhandler(err);
    } else {
      if (orig_url.endsWith("/")) {
        const indexServer = getIndexServer(dir);
        indexServer(req, res, finalhandler);
      } else {
        // Redirect so that clicking on paths in the listing works properly.
        res.writeHead(301, { Location: orig_url + "/" });
        res.end();
      }
    }
  });
};

function decodePath(path) {
  const segments = path.split("/");
  const decoded = [];
  for (const segment of segments) {
    decoded.push(decodeURIComponent(segment));
  }
  return decoded.join("/");
}
