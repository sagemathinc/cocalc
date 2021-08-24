/*
 Serve the landing server, which is a Next.js application, on /.
 */

import { join } from "path";
import { Application } from "express";
import initLandingServer from "@cocalc/landing-free";
import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/util-node/base-path";

export default async function init(app: Application) {
  const winston = getLogger("landing");
  winston.info("Initializing the landing page server...");
  const handler = await initLandingServer({
    basePath,
  });
  const endpoints = [
    basePath,
    join(basePath, "doc", "*"),
    join(basePath, "_next", "*"),
  ];
  winston.info(
    "Now using next.js handler to handle select endpoints",
    endpoints
  );
  for (const endpoint of endpoints) {
    app.all(endpoint, handler);
  }
}
