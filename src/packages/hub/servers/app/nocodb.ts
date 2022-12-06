/*
 Serve the NocoDB nocode database.

 This is entirely meant as a tool to help admins better understand their
 cocalc instance.  That's all.
*/

import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/backend/base-path";
import { Server } from "http";
import { Application, Request } from "express";
import { join } from "path";
import getAccount from "@cocalc/server/auth/get-account";
import getPrivateProfile from "@cocalc/server/accounts/profile/private";
const winston = getLogger("nocodb");

export default async function initNocoDB(app: Application, httpServer: Server) {
  let Noco;
  try {
    Noco = require("nocodb").Noco;
  } catch (_) {
    // We use require instead of import and support nocodb
    // not being installed.  That's because it's AGPL and
    // some on prem customers might ant an AGPL-free cocalc install.
    winston.info("NocoDB is not installed");
    return;
  }
  const base = join(basePath, "nocodb");
  winston.info(`Initializing the NocoDB server at ${base}`);
  const nocoHandler = await Noco.init({}, httpServer, app);
  const handler = async (req, res) => {
    if (!(await isAdmin(req))) {
      // only admins can connected to nocodb
      res.send(
        `You must be <a href="${join(
          basePath,
          "auth/sign-in"
        )}">signed in</a> as an Administrator of this site to access ${join(
          base,
          req.url
        )}`
      );
    } else {
      nocoHandler(req, res);
    }
  };
  app.use(base, handler);
}

async function isAdmin(req: Request): Promise<boolean> {
  const account_id = await getAccount(req);
  // winston.debug("request to nocodb from ", account_id);
  if (!account_id) return false;
  // This private profile contains the name, email, etc.  TODO: we could use it
  // to automate sign in / account creation to nocodb.
  const { is_admin } = await getPrivateProfile(account_id);
  // winston.debug("request to nocodb is_admin = ", is_admin);
  return !!is_admin;
}
