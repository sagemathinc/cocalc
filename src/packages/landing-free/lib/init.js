/*
IMPORTANT: to use this from packages/hub (say), it's critical that
packages/hub *also* have its own copy of next installed.
Otherwise, you'll see an error about

   "Parsing error: Cannot find module 'next/babel'"

This is mentioned here, and it's maybe a bug in next?
https://www.gitmemory.com/issue/vercel/next.js/26127/862661818
*/

const { join } = require("path");
const getLogger = require("@cocalc/util-node/logger").default;
const next = require("next");
const conf = require("../next.config");
const getCustomize =
  require("@cocalc/util-node/server-settings/customize").default;

const winston = getLogger("landing-free:init");

async function init() {
  // Get information that describes the cocalc server from the database, including the basePath.
  const customize = await getCustomize();
  winston.info(`initialized customize data ${JSON.stringify(customize)}`);

  // dev = Whether or not to run in dev mode.  This features hot module reloading,
  // but navigation between pages and serving pages is much slower.
  const dev = process.env.NODE_ENV != "production";

  let { basePath } = customize;
  if (basePath == null || basePath == "/") {
    // this is the next.js definition of "basePath";
    // it differs from what we use in cocalc and internally here too.
    basePath = "";
  }
  winston.info(`nextjs basePath=${basePath}`);
  conf.basePath = basePath;

  winston.info(`creating next.js app with dev=${dev}`);
  const app = next({ dev, conf, dir: join(__dirname, "..") });
  const handle = app.getRequestHandler();
  winston.info("preparing next.js app...");
  await app.prepare();
  winston.info("ready to handle requests:");
  return (req, res) => {
    winston.http(`req.url=${req.url}`);
    handle(req, res);
  };
}

module.exports = init;
