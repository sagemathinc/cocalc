/*
IMPORTANT: to use this from packages/hub (say), it's critical that
packages/hub *also* have its own copy of next installed.
Otherwise, you'll see an error about

   "Parsing error: Cannot find module 'next/babel'"

This is mentioned here, and it's maybe a bug in next?
https://www.gitmemory.com/issue/vercel/next.js/26127/862661818
*/

const { join } = require("path");
const next = require("next");
const conf = require("../next.config");
const getLogger = require("@cocalc/util-node/logger").default;

async function init({ basePath }) {
  const winston = getLogger("share-server:init");

  // dev = Whether or not to run in dev mode.  This features hot module reloading,
  // but navigation between pages and serving pages is much slower.
  const dev = process.env.NODE_ENV != "production";

  // We do this to ensure that our config is like when
  // running things directly (via npm run dev), without having
  // to set the BASE_PATH env variable, which might have
  // a strange impact somewhere else in CoCalc.
  conf.basePath = basePath == "/" ? "" : basePath; // won't happen since is "../share".
  conf.env.BASE_PATH = basePath;

  winston.info(
    `creating next.js app with basePath="${basePath}", and dev=${dev}`
  );
  const app = next({ dev, conf, dir: join(__dirname, "..") });
  const handle = app.getRequestHandler();
  winston.info("preparing next.js app...");
  await app.prepare();
  winston.info("ready to handle next.js requests");
  return (req, res) => {
    winston.http("req.url %s", req.url);
    handle(req, res);
  };
}

module.exports = init;
