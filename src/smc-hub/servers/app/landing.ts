/* Serve the landing server, which is a Next.js application, on /.
 */

import { join } from "path";
import { Application } from "express";
import initLandingServer from "@cocalc/landing-free";
import { getLogger } from "smc-hub/logger";
import basePath from "smc-util-node/base-path";
import getCustomize from "./landing-customize";

export default async function init(app: Application) {
  const winston = getLogger("landing");
  const customize = await getCustomize();
  winston.info(
    `Initializing the landing server: ${JSON.stringify(customize)}...`
  );
  const handler = await initLandingServer({
    basePath,
    winston,
    customize,
  });
  const endpoints = [
    basePath,
    join(basePath, "doc", "*"),
    join(basePath, "_next", "*"),
  ];
  winston.info("Now using next.js handler to handle select endpoints", endpoints);
  for (const endpoint of endpoints) {
    app.all(endpoint, handler);
  }
}
