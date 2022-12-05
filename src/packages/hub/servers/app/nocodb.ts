/*
 Serve the NocoDB nocode database.

 This is entirely meant as a tool to help admins better understand their
 cocalc instance.  That's all.
*/

import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/backend/base-path";
import { Server } from "http";
import { Application } from "express";
import { join } from "path";

export default async function initNocoDB(app: Application, httpServer: Server) {
  const winston = getLogger("nocodb");

  let Noco;
  try {
    Noco = require("nocodb").Noco;
  } catch (_) {
    // We use require instead of import and support nocodb
    // not being installed.  That's because it's AGPL and
    // some on prem customers might ant an AGPL-free cocalc install.
    winston.info("NocoDB is not available");
    return;
  }
  const base = join(basePath, "nocodb");
  winston.info(`Initializing the NocoDB server at ${base}`);
  const handler = await Noco.init({}, httpServer, app);
  app.use(base, handler);
}
