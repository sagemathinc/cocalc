/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const serveRawPath = require("./lib/server/serve-raw-path");
const { pathFromID } = require("./lib/path-to-files");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const basePath = require("./lib/basePath")();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true);
    const { pathname, query } = parsedUrl;
    const path = basePath ? pathname.slice(basePath.length) : pathname;

    if (path === "" || path === "/") {
      // Workaround a weird bug where if next.js has an index.jsx
      // then the back button breaks everywhere.  Hopefully this
      // can somehow go away, but for now this works.
      app.render(req, res, "/home", query);
    } else if (path.startsWith("/public_paths/raw/")) {
      handleRaw(req, res, path, false);
    } else if (path.startsWith("/public_paths/download/")) {
      handleRaw(req, res, path, true);
    } else {
      handle(req, res, parsedUrl);
    }
  }).listen(3000, () => {
    if (process.env.COCALC_PROJECT_ID && basePath) {
      // Running from within a cocalc project.
      console.log(`\n> Ready on https://cocalc.com${basePath}\n`);
    } else {
      console.log(
        `\n> Ready on http://localhost:3000${basePath ? basePath : ""}\n`
      );
    }
  });
});

async function handleRaw(req, res, path, download) {
  // Access is via public_paths/[raw|download]/[shareid]/path/to/file
  // See remarks in lib/server/serve-raw-path for
  // what path/to/file is relative to...
  const segments = path.split("/");
  const id = segments[3]; // 3 because /public_paths/raw/; similar for 4 below.
  let sharePath;
  try {
    sharePath = await pathFromID(id);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.write(`404 Not Found - ${err}\n`);
    res.end();
    return;
  }
  serveRawPath({
    req,
    res,
    path: segments.slice(4).join("/"), // path to the file inside the public share.
    sharePath, // path to directory on filesystem that contains the public share
    download,
  });
}
