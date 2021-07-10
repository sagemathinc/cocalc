/* Serve the landing server on /
 */

import { join } from "path";
import { Application } from "express";
import * as initLandingServer from "@cocalc/landing-free";
import { getLogger } from "smc-hub/logger";
import basePath from "smc-util-node/base-path";
import getCustomize from "./landing-customize";

export default async function init(app: Application) {
  const winston = getLogger("landing");
  const customize = await getCustomize();
  winston.info(`Initializing the landing server: ${JSON.stringify(customize)}...`);
  const handler = await initLandingServer({
    basePath,
    winston,
    customize,
  });
  winston.info("Now using next.js handler to handle select endpoints");
  app.all(basePath, handler);
  app.all(join(basePath, "_next/*"), handler);
}
