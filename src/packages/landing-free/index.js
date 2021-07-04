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
  // dev = Whether or not to run in dev mode.  This features hot module reloading
  // and you can change the basePath without having to do `npm run build`.
  // If dev is false, things will only work if `npm run build` happened
  // with a basePath='', i.e., that's just for a production https://cocalc.com
  // deployment.  It's faster though!
  dev,
  // winston = an instance of the winston logger.
  winston,
  // and finally the information that describes the cocalc server, including the basePath.
  customize,
}) {
  let { basePath } = customize;
  if (basePath == null || basePath == "/") {
    // this is the next.js definition of "basePath";
    // it differs from what we use in cocalc and internally here too.
    basePath = "";
  }
  winston.info(`initialized customize data ${JSON.stringify(customize)}`);
  // We do this to ensure that our config is exactly like when
  // running things directly (via npm run dev), without having
  // to set the BASE_PATH env variable, which might have
  // a strange impact somewhere else in CoCalc.
  conf.basePath = basePath;
  conf.env.BASE_PATH = basePath;
  conf.env.CUSTOMIZE = JSON.stringify(customize);

  winston.info(
    `creating next.js app with basePath="${basePath}", and dev=${dev}`
  );
  const app = next({ dev, conf, dir: __dirname });
  const handle = app.getRequestHandler();
  winston.info("preparing next.js app...");
  await app.prepare();
  winston.info("ready to handle next.js requests");
  return (req, res) => {
    winston.http(`req.url=${req.url}`);
    handle(req, res);
  };
}

module.exports = init;
