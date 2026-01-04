/*
The main hub express app.
*/

import cookieParser from "cookie-parser";
import express from "express";
import ms from "ms";
import { join } from "path";
import { parse as parseURL } from "url";
import * as Module from "module";
import { path as WEBAPP_PATH } from "@cocalc/assets";
import { path as CDN_PATH } from "@cocalc/cdn";
import vhostShare from "@cocalc/next/lib/share/virtual-hosts";
import { path as STATIC_PATH } from "@cocalc/static";
import { setup_health_checks as setupHealthChecks } from "../health-checks";
import { getLogger } from "../logger";
import initProxy from "../proxy";
import initAppRedirect from "./app/app-redirect";
import initBlobUpload from "./app/blob-upload";
import initUpload from "./app/upload";
import initBlobs from "./app/blobs";
import initCustomize from "./app/customize";
import { initMetricsEndpoint, setupInstrumentation } from "./app/metrics";
import initProjectHostBootstrap from "./app/project-host-bootstrap";
import initStats from "./app/stats";
import { database } from "./database";
import initHttpServer from "./http";
import initRobots from "./robots";
import basePath from "@cocalc/backend/base-path";
import { initConatServer } from "@cocalc/server/conat/socketio";
import { conatSocketioCount, root } from "@cocalc/backend/data";
import createApiV2Router from "@cocalc/next/lib/api-v2-router";

const PYTHON_API_PATH = join(root, "python", "cocalc-api", "site");

// NOTE: we are not using compression because that interferes with streaming file download,
// and could be generally confusing.

// Used for longterm caching of files. This should be in units of seconds.
const MAX_AGE = Math.round(ms("10 days") / 1000);
const SHORT_AGE = Math.round(ms("10 seconds") / 1000);

interface Options {
  projectControl;
  isPersonal: boolean;
  nextServer: boolean;
  proxyServer: boolean;
  conatServer: boolean;
  cert?: string;
  key?: string;
  projectProxyHandlersPromise?;
}

export default async function init(opts: Options): Promise<{
  httpServer;
  router: express.Router;
}> {
  const winston = getLogger("express-app");
  winston.info("creating express app");

  // Create an express application
  const app = express();
  app.disable("x-powered-by"); // https://github.com/sagemathinc/cocalc/issues/6101

  // makes JSON (e.g. the /customize endpoint) pretty-printed
  app.set("json spaces", 2);

  // healthchecks are for internal use, no basePath prefix
  // they also have to come first, since e.g. the vhost depends
  // on the DB, which could be down
  const basicEndpoints = express.Router();
  await setupHealthChecks({ router: basicEndpoints, db: database });
  app.use(basicEndpoints);

  // also, for the same reasons as above, setup the /metrics endpoint
  initMetricsEndpoint(basicEndpoints);

  // now, we build the router for some other endpoints
  const router = express.Router();

  // This must go very early - we handle virtual hosts, like wstein.org
  // before any other routes or middleware interfere.
  if (opts.nextServer) {
    app.use(vhostShare());
  }

  app.use(cookieParser());

  // Install custom middleware to track response time metrics via prometheus
  setupInstrumentation(router);

  // see http://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address
  app.enable("trust proxy");

  router.use("/robots.txt", initRobots());

  // setup the analytics.js endpoint (skip for launchpad/minimal modes)
  if (
    process.env.COCALC_MODE !== "launchpad" &&
    !process.env.COCALC_DISABLE_ANALYTICS
  ) {
    const analyticsModule = lazyRequire(join(__dirname, "..", "analytics")) as {
      initAnalytics?: (router: express.Router, db: any) => Promise<void>;
    };
    if (analyticsModule?.initAnalytics) {
      await analyticsModule.initAnalytics(router, database);
    }
  }

  // The /static content, used by docker, development, etc.
  // This is the stuff that's packaged up via webpack in packages/static.
  await initStatic(router);

  // Static assets that are used by the webapp, the landing page, etc.
  router.use(
    "/webapp",
    express.static(WEBAPP_PATH, { setHeaders: cacheLongTerm }),
  );

  // This is @cocalc/cdn – cocalc serves everything it might get from a CDN on its own.
  // This is defined in the @cocalc/cdn package.  See the comments in packages/cdn.
  router.use("/cdn", express.static(CDN_PATH, { setHeaders: cacheLongTerm }));

  // Redirect requests to /app to /static/app.html.
  // TODO: this will likely go away when rewrite the landing pages to not
  // redirect users to /app in the first place.
  router.get("/app", (req, res) => {
    // query is exactly "?key=value,key=..."
    const query = parseURL(req.url, true).search || "";
    res.redirect(join(basePath, "static/app.html") + query);
  });

  router.use("/api/python", express.static(PYTHON_API_PATH));

  initBlobs(router);
  initBlobUpload(router);
  initUpload(router);
  initCustomize(router, opts.isPersonal);
  initStats(router);
  initAppRedirect(router, { includeAuth: !opts.nextServer });
  initProjectHostBootstrap(router);

  if (!opts.nextServer) {
    winston.info("enabling api/v2 express router (nextjs disabled)");
    router.use("/api/v2", createApiV2Router());
  }

  if (basePath !== "/") {
    app.use(basePath, router);
  } else {
    app.use(router);
  }

  const httpServer = initHttpServer({
    cert: opts.cert,
    key: opts.key,
    app,
  });

  if (opts.conatServer) {
    winston.info(`initializing the Conat Server`);
    initConatServer({
      httpServer,
      ssl: !!opts.cert,
    });
  }

  // This must be second to the last, since it will prevent any
  // other upgrade handlers from being added to httpServer.
  if (opts.proxyServer) {
    winston.info(`initializing the http proxy server`, {
      conatSocketioCount,
      conatServer: !!opts.conatServer,
      isPersonal: opts.isPersonal,
    });
    initProxy({
      projectControl: opts.projectControl,
      isPersonal: opts.isPersonal,
      httpServer,
      app,
      projectProxyHandlersPromise: opts.projectProxyHandlersPromise,
      // enable proxy server for /conat if:
      //  (1) we are not running conat at all from here, or
      //  (2) we are running socketio in cluster mode, hence
      //      on a different port
      proxyConat: !opts.conatServer || (conatSocketioCount ?? 1) >= 2,
    });
  }

  // IMPORTANT:
  // The nextjs server must be **LAST** (!), since it takes
  // all routes not otherwise handled above.
  if (opts.nextServer) {
    // The Next.js server
    const initNextModule = lazyRequire("./app/next") as {
      default?: (app: express.Application) => Promise<void>;
    };
    const initNext = initNextModule.default ?? (initNextModule as any);
    await initNext(app);
  }
  return { httpServer, router };
}

function cacheShortTerm(res) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${SHORT_AGE}, must-revalidate`,
  );
  res.setHeader(
    "Expires",
    new Date(Date.now().valueOf() + SHORT_AGE).toUTCString(),
  );
}

// Various files such as the webpack static content should be cached long-term,
// and we use this function to set appropriate headers at various points below.
function cacheLongTerm(res) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${MAX_AGE}, must-revalidate'`,
  );
  res.setHeader(
    "Expires",
    new Date(Date.now().valueOf() + MAX_AGE).toUTCString(),
  );
}

async function initStatic(router) {
  let compiler: any = null;
  if (
    process.env.NODE_ENV != "production" &&
    !process.env.NO_RSPACK_DEV_SERVER
  ) {
    // Try to use the integrated rspack dev server, if it is installed.
    // It might not be installed at all, e.g., in production, and there
    // @cocalc/static can't even be imported.
    try {
      const rspackCompiler = (
        lazyRequire("@cocalc/static/rspack-compiler") as {
          rspackCompiler?: () => any;
        }
      ).rspackCompiler;
      if (typeof rspackCompiler === "function") {
        compiler = rspackCompiler();
      }
    } catch (err) {
      console.warn("rspack is not available", err);
    }
  }

  if (compiler != null) {
    console.warn(
      "\n-----------\n| RSPACK: Running rspack dev server for frontend /static app.\n| Set env variable NO_RSPACK_DEV_SERVER to disable.\n-----------\n",
    );
    const webpackDevMiddleware = lazyRequire("webpack-dev-middleware") as any;
    const webpackHotMiddleware = lazyRequire("webpack-hot-middleware") as any;
    router.use("/static", webpackDevMiddleware(compiler, {}));
    router.use("/static", webpackHotMiddleware(compiler, {}));
  } else {
    router.use(
      join("/static", STATIC_PATH, "app.html"),
      express.static(join(STATIC_PATH, "app.html"), {
        setHeaders: cacheShortTerm,
      }),
    );
    router.use(
      "/static",
      express.static(STATIC_PATH, { setHeaders: cacheLongTerm }),
    );
  }

  // Also, immediately 404 if anything else under static is requested
  // which isn't handled above, rather than passing this on to the next app
  router.use("/static", (_, res) => res.status(404).end());
}

const moduleRequire: NodeRequire | undefined =
  typeof require === "function"
    ? require
    : typeof (Module as { createRequire?: (path: string) => NodeRequire })
          .createRequire === "function"
      ? (Module as { createRequire: (path: string) => NodeRequire }).createRequire(
          join(process.cwd(), "noop.js"),
        )
      : undefined;

function lazyRequire<T = any>(moduleName: string): T {
  // Avoid static require so ncc doesn't try to bundle dev-only deps.
  if (!moduleRequire) {
    throw new Error("require is not available in this runtime");
  }
  return moduleRequire(moduleName) as T;
}
