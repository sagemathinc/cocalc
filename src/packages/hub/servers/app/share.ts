/*
 Serve the share server, which is a Next.js application, on /share
 */

import { join } from "path";
import { Application } from "express";
// @ts-ignore
import initShareServer from "@cocalc/share/init";
import handleRaw from "@cocalc/share/lib/handle-raw";
import { getLogger } from "@cocalc/hub/logger";
import getCustomize from "./landing-customize";

export default async function init(app: Application) {
  const winston = getLogger("share");
  const customize = await getCustomize();
  // getCustomize uses the server base path, but share server append /share to it.
  const basePath = join(customize.basePath, "share");
  customize.basePath = basePath;

  // TODO: need way to configure share.cocalc.com to set
  // customize.appBasePath = 'https://cocalc.com/'.
  // This could be a command line flag, env variable, or the database.

  winston.info(`Initializing the share server... with customize=%j`, customize);
  const handler = await initShareServer({
    basePath,
    winston,
    customize,
  });

  const raw = join(basePath, "raw");
  app.all(join(raw, "*"), (req, res, next) => {
    const url = req.url.slice(raw.length + 1);
    const i = url.indexOf("/");
    if (i == -1) {
      res.status(404).end();
      return;
    }
    const id = url.slice(0, i);
    const path = url.slice(i + 1);
    handleRaw({ id, path, req, res, next });
  });

  const endpoints = [
    basePath,
    join(basePath, "*"),
    join(basePath, "_next", "*"),
  ];
  winston.info(
    "Now using next.js packages/share handler to handle select endpoints under /share",
    endpoints
  );
  for (const endpoint of endpoints) {
    app.all(endpoint, handler);
  }
}
