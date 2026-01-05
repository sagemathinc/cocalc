/*
The main hub express app.
*/

import cookieParser from "cookie-parser";
import express from "express";
import { existsSync } from "fs";
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
import initSelfHostConnector from "./app/self-host-connector";
import initStats from "./app/stats";
import { database } from "./database";
import initHttpServer from "./http";
import initRobots from "./robots";
import basePath from "@cocalc/backend/base-path";
import { initConatServer } from "@cocalc/server/conat/socketio";
import { conatSocketioCount, root } from "@cocalc/backend/data";
import { ACCOUNT_ID_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import createApiV2Router from "@cocalc/next/lib/api-v2-router";

const logger = getLogger("hub:servers:express-app");

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
  logger.info("creating express app");

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
  if (!opts.nextServer) {
    initLanding(router);
  }
  initAppRedirect(router, { includeAuth: !opts.nextServer });
  initProjectHostBootstrap(router);
  initSelfHostConnector(router);

  if (!opts.nextServer) {
    logger.info("enabling api/v2 express router (nextjs disabled)");
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
    logger.info(`initializing the Conat Server`);
    initConatServer({
      httpServer,
      ssl: !!opts.cert,
    });
  }

  // This must be second to the last, since it will prevent any
  // other upgrade handlers from being added to httpServer.
  if (opts.proxyServer) {
    logger.info(`initializing the http proxy server`, {
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

function resolveStaticPath(): string {
  const candidates: string[] = [];
  if (process.env.COCALC_STATIC_PATH) {
    candidates.push(process.env.COCALC_STATIC_PATH);
  }
  if (process.env.COCALC_BUNDLE_DIR) {
    candidates.push(join(process.env.COCALC_BUNDLE_DIR, "static"));
  }
  candidates.push(
    STATIC_PATH,
    join(process.cwd(), "static"),
    join(__dirname, "..", "static"),
  );
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "app.html"))) {
      return candidate;
    }
  }
  return STATIC_PATH;
}

async function initStatic(router) {
  const staticPath = resolveStaticPath();
  const staticLogger = getLogger("express-app:static");
  if (!existsSync(join(staticPath, "app.html"))) {
    staticLogger.warn("static assets not found", { staticPath });
  } else {
    staticLogger.info("serving static assets", { staticPath });
  }
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
      "/static/app.html",
      express.static(join(staticPath, "app.html"), {
        setHeaders: cacheShortTerm,
      }),
    );
    router.use(
      "/static",
      express.static(staticPath, { setHeaders: cacheLongTerm }),
    );
  }

  // Also, immediately 404 if anything else under static is requested
  // which isn't handled above, rather than passing this on to the next app
  router.use("/static", (_, res) => res.status(404).end());
}

function initLanding(router: express.Router) {
  logger.info("initLanding");
  router.get("/", (req, res) => {
    const base = basePath === "/" ? "" : basePath;
    const signedIn = Boolean(req.cookies?.[ACCOUNT_ID_COOKIE_NAME]);
    const links: Array<{ href: string; label: string }> = [
      { href: `${base}/auth/sign-in`, label: "Sign in" },
      { href: `${base}/auth/sign-up`, label: "Sign up" },
    ];
    if (signedIn) {
      links.unshift({ href: `${base}/projects`, label: "Projects" });
    }
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CoCalc Launchpad</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f6f1;
        --fg: #1f1f1f;
        --muted: #6a6a6a;
        --card: #ffffff;
        --accent: #2f6f6d;
        --border: #e5e1d8;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
        background: radial-gradient(1200px 600px at 20% -10%, #e9f0ea, transparent),
                    radial-gradient(800px 400px at 120% 20%, #f6efe6, transparent),
                    var(--bg);
        color: var(--fg);
      }
      .wrap {
        max-width: 760px;
        margin: 10vh auto;
        padding: 24px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
      }
      h1 {
        font-size: 28px;
        margin: 0 0 8px;
      }
      p {
        margin: 0 0 16px;
        color: var(--muted);
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      a {
        text-decoration: none;
        color: var(--accent);
        border: 1px solid var(--accent);
        padding: 8px 14px;
        border-radius: 999px;
        font-weight: 600;
      }
      a.primary {
        background: var(--accent);
        color: #fff;
      }
      .hint {
        margin-top: 16px;
        font-size: 13px;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>CoCalc Launchpad</h1>
        <p>Lightweight control plane for managing project hosts and accounts.</p>
        <div class="links">
          ${links
            .map((link, index) => {
              const cls = index === 0 ? "primary" : "";
              return `<a class="${cls}" href="${link.href}">${link.label}</a>`;
            })
            .join("")}
        </div>
        <div class="hint">
          ${signedIn ? "You're signed in." : "Sign in to continue."}
        </div>
      </div>
    </div>
  </body>
</html>`);
  });
}

const moduleRequire: NodeRequire | undefined =
  typeof require === "function"
    ? require
    : typeof (Module as { createRequire?: (path: string) => NodeRequire })
          .createRequire === "function"
      ? (
          Module as { createRequire: (path: string) => NodeRequire }
        ).createRequire(join(process.cwd(), "noop.js"))
      : undefined;

function lazyRequire<T = any>(moduleName: string): T {
  // Avoid static require so ncc doesn't try to bundle dev-only deps.
  if (!moduleRequire) {
    throw new Error("require is not available in this runtime");
  }
  return moduleRequire(moduleName) as T;
}
