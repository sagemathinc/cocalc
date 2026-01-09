/*
 Serve the Next.js application server, which provides:

- the share server for public_paths
- the landing pages
- ... and more?!
*/

import { Application, NextFunction, Request, Response } from "express";
import { join } from "path";

// @ts-ignore -- TODO: typescript doesn't like @cocalc/next/init (it is a js file).
import initNextServer from "@cocalc/next/init";
import basePath from "@cocalc/backend/base-path";
import { getLogger } from "@cocalc/hub/logger";
import handleRaw from "@cocalc/next/lib/share/handle-raw";
import { callback2 } from "@cocalc/util/async-utils";
import { getDatabase } from "../database";
import createLandingRedirect from "./landing-redirect";
import shareRedirect from "./share-redirect";
import { separate_file_extension } from "@cocalc/util/misc";

export default async function init(app: Application) {
  const winston = getLogger("nextjs");

  winston.info("Initializing the nextjs server...");

  // the Hot module reloader triggers some annoying "fetch" warnings, so
  // we temporarily disable all warnings, then re-enable them immediately below.
  // https://www.phind.com/search?cache=3a6edffa-ce34-4d0d-b448-6ea45f325783
  const originalWarningListeners = process.listeners("warning").slice();
  process.removeAllListeners("warning");
  const handler = await initNextServer({ basePath });
  originalWarningListeners.forEach((listener) => {
    process.on("warning", listener);
  });

  winston.info("Initializing the nextjs share server...");
  const shareServer = await runShareServer();
  const shareBasePath = join(basePath, "share");

  if (shareServer) {
    // We create a redirect middleware and a raw/download
    // middleware, since the share server will be fully available.
    // IMPORTANT: all files are also served with download:true, so that
    // they don't get rendered with potentially malicious content.
    // The only way we could allow this is to serve all raw content
    // from a separate domain, e.g., raw.cocalc.com.  That would be
    // reasonable on cocalc.com, but to ensure this for all on-prem,
    // etc. servers is definitely too much, so we just disable this.
    // For serving actual raw content, the solution will be to use
    // a vhost.

    // 1: The raw static server:
    const raw = join(shareBasePath, "raw");
    app.all(
      join(raw, "*"),
      (req: Request, res: Response, next: NextFunction) => {
        // Embedding only enabled for PDF files -- see note above
        const download =
          separate_file_extension(req.path).ext.toLowerCase() !== "pdf";
        try {
          handleRaw({
            ...parseURL(req, raw),
            req,
            res,
            next,
            download,
          });
        } catch (_err) {
          res.status(404).end();
        }
      },
    );

    // 2: The download server -- just like raw, but files always get sent via download.
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
      },
    );

    // 3: Redirects for backward compat; unfortunately there's slight
    // overhead for doing this on every request.

    app.all(join(shareBasePath, "*"), shareRedirect(shareBasePath));
  }

  const landingRedirect = createLandingRedirect();
  app.all(join(basePath, "index.html"), landingRedirect);
  app.all(join(basePath, "doc*"), landingRedirect);
  app.all(join(basePath, "policies*"), landingRedirect);

  // The next.js server that serves everything else.
  winston.info(
    "Now using next.js packages/share handler to handle all endpoints not otherwise handled",
  );

  // nextjs listens on everything else
  app.all("*", handler);
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
  const database = getDatabase();
  const { rows } = await callback2(database._query, {
    query: "SELECT value FROM server_settings WHERE name='share_server'",
  });
  return rows.length > 0 && rows[0].value == "yes";
}
