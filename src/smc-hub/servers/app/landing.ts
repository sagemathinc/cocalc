/* Serve the landing server on /
 */

import { Application } from "express";
import * as initLandingServer from "@cocalc/landing-free";
import { getLogger } from "smc-hub/logger";
import basePath from "smc-util-node/base-path";

export default async function init(app: Application) {
  const winston = getLogger("landing");
  const dev = process.env.NODE_ENV !== "production";
  winston.info(
    `Initializing the landing server: basePath="${basePath}", dev=${dev}`
  );
  const handler = await initLandingServer({ basePath, dev, winston });
  winston.info("Now using next.js handler to handle select endpoints");
  app.all(basePath, handler);
  app.all(basePath + "/_next/*", handler);
}
