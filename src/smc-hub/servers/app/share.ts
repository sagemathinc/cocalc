/* Serve the share server, which is a Next.js application, on /share
 */

import { join } from "path";
import { Application } from "express";
import * as initShareServer from "@cocalc/share";
import { getLogger } from "smc-hub/logger";
import getCustomize from "./landing-customize";

export default async function init(app: Application) {
  const winston = getLogger("share");
  const customize = await getCustomize();
  // getCustomize uses the server base path, but share server append /share to it.
  const basePath = join(customize.basePath, "share");
  customize.basePath = basePath;

  winston.info(`Initializing the share server... with customize=%j`, customize);
  const handler = await initShareServer({
    basePath,
    winston,
    customize,
  });
  winston.info(
    "Now using next.js share handler to handle select endpoints under /share"
  );
  app.all(basePath, handler);
  app.all(join(basePath, "_next/*"), handler);
}
