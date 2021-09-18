/*
 Serve the Next.js application server, which provides:

- the share server for public_paths
- the landing pages
- ... and more?!
*/

import { join } from "path";
import { Application, Request, Response, NextFunction } from "express";
// @ts-ignore -- TODO: typescript doesn't like @cocalc/next/init (it is a js file).
import initNextServer from "@cocalc/next/init";
import handleRaw from "@cocalc/next/lib/share/handle-raw";
import { getLogger } from "@cocalc/hub/logger";
import shareRedirect from "./share-redirect";
import createLandingRedirect from "./landing-redirect";
import basePath from "@cocalc/util-node/base-path";
import { database } from "../database";
import { callback2 } from "@cocalc/util/async-utils";

export default async function init(app: Application) {
  const winston = getLogger("nextjs");

  winston.info("Initializing the nextjs server...");
  const handler = await initNextServer({ basePath });
  const shareServer = await runShareServer();
  const shareBasePath = join(basePath, "share");

  if (shareServer) {
    // We create a redirect middleware and a raw/download
    // middleware, since the share server will be fully available.
    // 1: The raw static server:
    const raw = join(shareBasePath, "raw");
    app.all(
      join(raw, "*"),
      (req: Request, res: Response, next: NextFunction) => {
        try {
          handleRaw({ ...parseURL(req, raw), req, res, next });
        } catch (_err) {
          res.status(404).end();
        }
      }
    );

    // 2: The download server -- just like raw, but files get sent via download.
    const download = join(shareBasePath, "download");
    app.all(
      join(download, "*"),
      (req: Request, res: Response, next: NextFunction) => {
        try {
          handleRaw({
            ...parseURL(req, download),
            req,
            res,
            next,
            download: true,
          });
        } catch (_err) {
          res.status(404).end();
        }
      }
    );

    // 3: Redirects for backward compat; unfortunately there's slight
    // overhead for doing this on every request.

    app.all(join(shareBasePath, "*"), shareRedirect(shareBasePath));
  }

  const landingRedirect = createLandingRedirect();
  app.all(join(basePath, "doc*"), landingRedirect);
  app.all(join(basePath, "policies*"), landingRedirect);

  // The next.js server that servers everything else.
  // These are the routes that the next.js server gets
  // traffic for:
  const endpoints = [
    basePath, // top-level landing page
    join(basePath, "features*"),
    join(basePath, "software*"),
    join(basePath, "policies*"),
    join(basePath, "pricing*"),
    join(basePath, "share*"),
    join(basePath, "api*"), // could be other api routes later -- but api/v1 is served via express!!!
    join(basePath, "_next*"),
  ];
  winston.info(
    "Now using next.js packages/share handler to handle select endpoints under /share",
    endpoints
  );
  for (const endpoint of endpoints) {
    app.all(endpoint, handler);
  }
}

function parseURL(req: Request, base): { id: string; path: string } {
  let url = req.url.slice(base.length + 1);
  let i = url.indexOf("/");
  if (i == -1) {
    url = url + "/";
    i = url.length - 1;
  }
  return { id: url.slice(0, i), path: decodeURI(url.slice(i + 1)) };
}

async function runShareServer(): Promise<boolean> {
  const { rows } = await callback2(database._query, {
    query: "SELECT value FROM server_settings WHERE name='share_server'",
  });
  return rows.length > 0 && rows[0].value == "yes";
}
