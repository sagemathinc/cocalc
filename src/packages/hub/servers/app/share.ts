/*
 Serve the share server, which is a Next.js application, on /share
*/

import { join } from "path";
import { Application, Request, Response, NextFunction } from "express";
// @ts-ignore -- for some reason typescript can't find this.  It is a js file.
import initShareServer from "@cocalc/next/init";
import handleRaw from "@cocalc/next/lib/share/handle-raw";
import { getLogger } from "@cocalc/hub/logger";
import redirect from "./share-redirect";
import basePath from "@cocalc/util-node/base-path";
import { database } from "../database";
import { callback2 } from "@cocalc/util/async-utils";

export default async function init(app: Application) {
  const winston = getLogger("share");

  const { rows } = await callback2(database._query, {
    query: "SELECT value FROM server_settings WHERE name='share_server'",
  });
  if (rows.length == 0 || rows[0].value == "no") {
    winston.info(
      "Share server is disabled via the server_settings database table.  Enable in Admin preferences if you want to start it."
    );
    return;
  } else {
    winston.info("Share server is enabled in the database.  Starting!");
  }

  const shareBasePath = join(basePath, "share");
  winston.info("Initializing the share server...");
  const handler = await initShareServer({
    basePath: shareBasePath,
  });

  // The raw static server:
  const raw = join(shareBasePath, "raw");
  app.all(join(raw, "*"), (req: Request, res: Response, next: NextFunction) => {
    try {
      handleRaw({ ...parseURL(req, raw), req, res, next });
    } catch (_err) {
      res.status(404).end();
    }
  });

  // The download server -- just like raw, but files get sent via download.
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

  // Redirects for backward compat; unfortunately there's slight
  // overhead for doing this on every request.
  app.all(join(shareBasePath, "*"), redirect(shareBasePath));

  // The next.js server that servers everything else.
  const endpoints = [
    shareBasePath,
    join(shareBasePath, "*"),
    join(shareBasePath, "_next", "*"),
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
