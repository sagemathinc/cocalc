/* Open CoCalc Server
 * this is a small part of hub_http_server, which serves the main index page and associated assets.
 * - "webapp" refers to files in SMC_ROOT/webapp-lib
 * - several aspects can be modified via the administrator's tab / "site settings"
 */

import { PostgreSQL } from "smc-hub/postgres/types";
import { callback2 } from "smc-util/async-utils";
import * as express from "express";
import * as path_module from "path";
const auth = require("./auth");
import { get_smc_root } from "./utils";

const WEBAPP_PATH = path_module.join(get_smc_root(), "webapp-lib");

interface GetData {
  base_url: string;
  db: PostgreSQL;
}

async function get_params(opts: GetData) {
  const { db, base_url } = opts;
  const settings = await callback2(db.get_server_settings_cached, {});
  const NAME = settings.site_name ?? "Open CoCalc";
  const PREFIX = ""; // this is unrelated of base_url. TODO remove it.
  const LOGO_SQUARE_URL =
    settings.logo_square ?? PREFIX + "webapp/cocalc-icon.svg";
  const LOGO_RECTANGULAR_URL =
    settings.logo_rectangular ?? PREFIX + "webapp/open-cocalc-font-dark.svg";

  const data = {
    PREFIX: PREFIX,
    NAME: NAME,
    BASE_URL: base_url ?? "",
    LOGO_SQUARE_URL,
    LOGO_RECTANGULAR_URL,
    DESCRIPTION: "Collaborative Calculation Online",
    ORGANIZATION_NAME: "Organization",
    ORGANIZATION_EMAIL: "",
    POLICIES_URL: "/policies",
    CONTACT_EMAIL: "contact@email",
    GOOGLE_ANALYTICS: ""
  };
  return data;
}

interface Setup {
  app: any;
  router: any;
  db: PostgreSQL;
  base_url: string;
  cacheLongTerm: (res, path) => void;
}

export function setup_open_cocalc(opts: Setup) {
  const { app, router, db, base_url, cacheLongTerm } = opts;
  app.set("views", "../webapp-lib");
  app.set("view engine", "pug");

  // static content for the main page
  router.use(
    "/webapp",
    express.static(WEBAPP_PATH, { setHeaders: cacheLongTerm })
  );

  const handle_index = async (req, res) => {
    // for convenicnece, a simple heuristic checks for the presence of the remember_me cookie
    // that's not a security issue b/c the hub will do the heavy lifting
    // TODO code in comments is a heuristic looking for the remember_me cookie, while when deployed the haproxy only
    // looks for the has_remember_me value (set by the client in accounts).
    // This could be done in different ways, it's not clear what works best.
    //remember_me = req.cookies[opts.base_url + 'remember_me']
    const has_remember_me =
      req.cookies[auth.remember_me_cookie_name(base_url, false)] ||
      req.cookies[auth.remember_me_cookie_name(base_url, true)];
    if (has_remember_me == "true") {
      // and remember_me?.split('$').length == 4 and not req.query.signed_out?
      res.redirect(opts.base_url + "/app");
    } else {
      //res.cookie(opts.base_url + 'has_remember_me', 'false', { maxAge: 60*60*1000, httpOnly: false })
      //res.sendFile(path_module.join(STATIC_PATH, 'index.html'), {maxAge: 0})
      const params = await get_params({ base_url, db });
      res.render("index.pug", params);
    }
  };

  router.get("/", handle_index);
  router.get("/index.html", handle_index);
}
