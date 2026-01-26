/*
This code makes it possible to start this nextjs server as a
Custmer Server as part of a running hub.  We thus combine together
a node.js express server (the hub) with a nextjs server in a
single process.

IMPORTANT: to use this from packages/hub (say), it's critical that
packages/hub *also* have its own copy of next installed.
Otherwise, you'll see an error about

   "Parsing error: Cannot find module 'next/babel'"

This is mentioned here, and it's maybe a bug in next?
https://www.gitmemory.com/issue/vercel/next.js/26127/862661818
*/

const { join } = require("path");
const getLogger = require("@cocalc/backend/logger").default;
const next = require("next");
const conf = require("../next.config");
const winston = getLogger("next:init");

async function init({ basePath }) {
  // dev = Whether or not to run in dev mode.  This features hot module reloading,
  // but navigation between pages and serving pages is much slower.
  const dev = process.env.NODE_ENV != "production";

  winston.info(`basePath=${basePath}`);
  // this is the next.js definition of "basePath";
  // it differs from what we use in cocalc and internally here too.
  conf.basePath = basePath == "/" ? "" : basePath;
  conf.env.BASE_PATH = basePath;

  winston.info(`creating next.js app with dev=${dev}`);
  const app = next({ dev, dir: join(__dirname, ".."), conf });

  const handle = app.getRequestHandler();
  winston.info("preparing next.js app...");

  // WARNING: This webpack init below is a workaround for a bug that was
  // introduced in Nextjs 13.  The custom server functionality described here
  //    https://nextjs.org/docs/advanced-features/custom-server
  // which we are using to init this server from the hub for some
  // reasons tries to import a build of webpack that needs to be init'd.
  // I couldn't find a report of this bug anywhere, but trying to make
  // a custom server with conf set to anything caused it, but without
  // conf things worked fine.  Somehow I tediously figured out the
  // following workaround, which is just to explicitly init webpack
  // before it gets used in prepare below:
  require("next/dist/compiled/webpack/webpack").init(); // see comment above.

  // app.prepare  sets app.upgradeHandler, etc. --
  // see https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next.ts#L276
  await app.prepare();

  if (!dev) {
    // The following is NOT a crazy a hack -- it's the result of me (ws)
    // carefully reading nextjs source code for several hours.
    // In production mode, we must completely disable the nextjs websocket upgrade
    // handler, since it breaks allowing users to connect to the hub via a websocket,
    // as it just kills all such connection immediately.  That's done via some new
    // code in nextjs v14 that IMHO the author does not understand, as you can see here:
    // https://github.com/vercel/next.js/blob/23eba22d02290cff0021a53f449f1d7e32a35e56/packages/next/src/server/lib/router-server.ts#L667
    // where there is a comment "// TODO: allow upgrade requests to pages/app paths?".
    // In dev mode we leave this, since it suppots hot module loading, though
    // we use a hack (see packages/hub/proxy/handle-upgrade.ts) that involves
    // removing listeners. That hack could probably be redone better by using
    // app.upgradeHandler directly.
    // To see the importance of this you must:
    //   - build in prod mode (not dev, obviously)
    //   - load the cocalc next landing page /
    //   - then try to view /projects
    // Without this fix, the websocket will disconnect. With this fix, the websocket works.
    winston.info("patching upgrade handler");
    app.upgradeHandler = () => { };
  }

  winston.info("ready to handle requests:");
  return (req, res) => {
    winston.http(`req.url=${req.url}`);
    // Express 5 compatibility: Make req.query writable for Next.js
    // Next.js's apiResolver tries to set req.query, but Express 5 makes it read-only
    //
    // This is what would end up in the next.js log, if this isn't set
    //  ⨯ [TypeError: Cannot set property query of #<IncomingMessage> which has only a getter] {
    //    page: '/api/v2/exec'
    //  }
    if (req.query !== undefined) {
      const queryValue = req.query;
      Object.defineProperty(req, "query", {
        value: queryValue,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    handle(req, res);
  };
}

module.exports = init;
