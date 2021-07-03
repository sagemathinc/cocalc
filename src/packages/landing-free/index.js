/*
IMPORTANT: to use this from smc-hub (say), it's critical that
smc-hub *also* have its own copy of next installed.
Otherwise, you'll see an error about

   "Parsing error: Cannot find module 'next/babel'"

This is mentioned here, and it's maybe a bug in next?
https://www.gitmemory.com/issue/vercel/next.js/26127/862661818
*/

const next = require("next");
const conf = require("./next.config");

async function init({
  // The basePath of the hub server
  basePath,
  // dev = Whether or not to run in dev mode.  This features hot module reloading
  // and you can change the basePath without having to do `npm run build`.
  // If dev is false, things will only work if `npm run build` happened
  // with a basePath='', i.e., that's just for a production https://cocalc.com
  // deployment.  It's faster though!
  dev,
  // winston = an instance of the winston logger.
  winston,
}) {
  if (basePath == "/") {
    basePath = "";
  }
  // We do this to ensure that our config is exactly like when
  // running things directly (via npm run dev), without having
  // to set the BASE_PATH env variable, which might have
  // a strange impact somewhere else in CoCalc.
  conf.basePath = basePath;
  conf.env.BASE_PATH = basePath;
  winston.info(
    `creating next.js app with basePath="${basePath}", and dev=${dev}`
  );
  process.env.BASE_PATH = basePath;
  const app = next({ dev, conf, dir: __dirname });
  const handle = app.getRequestHandler();
  winston.info("preparing next.js app...");
  await app.prepare();
  winston.info("ready to handle next.js requests");
  return (req, res) => {
    winston.http(`got request to ${req.url}`);
    handle(req, res);
  };
}

module.exports = init;
