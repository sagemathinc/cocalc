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
import { pghost } from "@cocalc/backend/data";
import dbPassword from "@cocalc/database/pool/password";

const NOCODB_ENDPOINT = "crm/db";

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
  const base = join(basePath, NOCODB_ENDPOINT);
  winston.info(`Initializing the NocoDB server at ${base}`);
  await prepForNocodb();
  const nocoHandler = await Noco.init({}, httpServer, app);
  const handler = async (req, res) => {
    // We block all requests that aren't from a signed in admin.
    if (!(await ensureAdmin(req, res, base))) {
      // TODO: this should really be a middleware right?  I'm basically doing middleware by hand.
      return;
    }
    if (req.url == "" || req.url == "/") {
      // nocodb tries to redirect to the dashboard in a way that is not compatible with our baseUrl, so we just do it here instead
      res.redirect(join(base, "dashboard"));
      return;
    }

    nocoHandler(req, res);
  };
  app.use(base, handler);
}

/*  TODO
  // Create a PostgreSQL user for nocodb to use.
~/cocalc/src$ createuser nocodb
~/cocalc/src$ createdb --owner nocodb nocodb

GRANT SELECT ON ALL TABLES IN SCHEMA public TO nocodb;
*/

async function prepForNocodb() {
  // As best I can tell, the only way to configure Noco is via setting env vars. That's fine, we do that here.
  // See https://docs.nocodb.com/getting-started/installation/
  process.env.DB_QUERY_LIMIT_DEFAULT = "50";
  process.env.NC_DB_JSON = JSON.stringify({
    client: "pg",
    connection: {
      password: dbPassword(),
      user: "nocodb",
      host: pghost,
      database: "nocodb",
    },
  });
}

async function ensureAdmin(req, res, base) {
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
    return false;
  }

  return true;
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
