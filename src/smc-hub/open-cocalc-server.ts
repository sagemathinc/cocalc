/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * license
 */

// Open CoCalc Server
// this is a small part of hub_http_server, which serves the main index page and associated assets.
// - "webapp" refers to files in SMC_ROOT/webapp-lib
// - several aspects can be modified via the administrator's tab / "site settings"

import { join } from "path";
import { PostgreSQL } from "./postgres/types";
import { callback2 } from "smc-util/async-utils";
import * as express from "express";
const auth = require("./auth");
import { have_active_registration_tokens } from "./utils";
import { versions as CDN_VERSIONS } from "@cocalc/cdn";
import { path as WEBAPP_PATH } from "webapp-lib";
import base_path from "smc-util-node/base-path";

function fallback(val: string | undefined, fallback: string): string {
  if (typeof val === "string" && val.length > 0) {
    return val;
  } else {
    return fallback;
  }
}

async function get_params(db: PostgreSQL) {
  const settings = await callback2(db.get_server_settings_cached, {});
  const ANONYMOUS_SIGNUP = !(await have_active_registration_tokens(db));
  const NAME = settings.site_name;
  const DESCRIPTION = settings.site_description;
  const PREFIX = ""; // this is unrelated of base_path, used for subdirectories
  const LOGO_SQUARE_URL = fallback(
    settings.logo_square,
    PREFIX + "webapp/cocalc-icon.svg"
  );
  const LOGO_RECTANGULAR_URL = fallback(
    settings.logo_rectangular,
    PREFIX + "webapp/open-cocalc-font-dark.svg"
  );

  const SPLASH_IMG = fallback(
    settings.splash_image,
    join(base_path, "cdn/pix/cocalc-screenshot-20200128-nq8.png")
  );

  // NOTE: we violate the definition of base path in this one place,
  // since this var is only used for the landing server, and the
  // _inc_head.pug template would be really complicated having to
  // distinguish between / and /foo... (and I plan to rewrite this
  // very soon).
  const BASE_PATH = base_path == '/' ? '' : base_path;
  const ORGANIZATION_EMAIL = settings.organization_email;
  const ORGANIZATION_NAME = settings.organization_name;
  const ORGANIZATION_URL = settings.organization_url;
  const HELP_EMAIL = settings.help_email;
  const COMMERCIAL = settings.commercial;

  const data = {
    // to be compatible with webpack
    htmlWebpackPlugin: {
      options: {
        BASE_PATH,
        CDN_VERSIONS,
        PREFIX,
        COMMERCIAL,
      },
    },
    PREFIX,
    NAME,
    DESCRIPTION,
    BASE_PATH,
    LOGO_SQUARE_URL,
    LOGO_RECTANGULAR_URL,
    SPLASH_IMG,
    INDEX_INFO: settings.index_info_html,
    ORGANIZATION_NAME,
    ORGANIZATION_URL,
    HELP_EMAIL,
    CONTACT_EMAIL: fallback(ORGANIZATION_EMAIL, HELP_EMAIL),
    TOS_URL: settings.terms_of_service_url,
    ANONYMOUS_SIGNUP,
  };
  return data;
}

interface Setup {
  app: any;
  router: any;
  db: PostgreSQL;
  cacheLongTerm: (res, path) => void;
  winston: any;
}

export function setup_open_cocalc(opts: Setup) {
  const { app, router, db, cacheLongTerm, winston } = opts;
  winston.debug(`serving /webapp from filesystem: "${WEBAPP_PATH}"`);
  app.set("views", "../webapp-lib/landing");
  app.set("view engine", "pug");

  // expand the scope of the service worker
  router.use("/webapp/serviceWorker.js", (_req, res, next) => {
    res.set("service-worker-allowed", base_path);
    next();
  });

  // static content for the main page
  console.log("/webapp serving ", WEBAPP_PATH);
  router.use(
    "/webapp",
    express.static(WEBAPP_PATH, { setHeaders: cacheLongTerm })
  );

  const handle_index = async (req, res) => {
    winston.debug("open cocalc/handle_index", req.path);
    // for convenience, a simple heuristic checks for the presence of the remember_me cookie
    // that's not a security issue b/c the hub will do the heavy lifting
    const has_remember_me =
      req.cookies[auth.remember_me_cookie_name(false)] ||
      req.cookies[auth.remember_me_cookie_name(true)];
    if (has_remember_me == "true") {
      res.redirect(join(base_path, "app"));
    } else {
      const params = await get_params(db);
      res.render("index.pug", params);
    }
  };

  router.get("/", handle_index);
  router.get("/index.html", handle_index);
}
