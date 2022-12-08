import { Application } from "express";
import { Server } from "http";
import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/backend/base-path";
import { join } from "path";

const winston = getLogger("nocodb");

const NOCODB_ENDPOINT = "crm/db";

export default async function initNocoDB(app: Application, httpServer: Server) {
  let initNocoDB;
  try {
    initNocoDB = require("@cocalc/crm").initNocoDB;
  } catch (err) {
    // We use require instead of import and support nocodb
    // not being installed.  That's because it's AGPL and
    // some on prem customers might ant an AGPL-free cocalc install.
    winston.info("@cocalc/crm nocodb is not installed");
    const base = join(basePath, NOCODB_ENDPOINT);
    const handler = (_, res) => {
      res.send(`CRM functionality is not installed<br/> <pre>${err}</pre>`);
    };
    app.use(base, handler);
    return;
  }
  initNocoDB(app, httpServer, NOCODB_ENDPOINT);
}
