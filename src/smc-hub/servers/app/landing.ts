/* Serve the landing server on /
 */

import { Application } from "express";
import * as initLandingServer from "@cocalc/landing-free";
import { getLogger } from "smc-hub/logger";
import basePath from "smc-util-node/base-path";
import { callback2 } from "smc-util/async-utils";
import { database } from "../database";
import { Customize } from "@cocalc/landing-free/lib/customize";

export default async function init(app: Application) {
  const winston = getLogger("landing");
  const dev = process.env.NODE_ENV !== "production";
  winston.info(
    `Initializing the landing server: basePath="${basePath}", dev=${dev}`
  );
  const customize = await getCustomize();
  const handler = await initLandingServer({
    basePath,
    dev,
    winston,
    customize,
  });
  winston.info("Now using next.js handler to handle select endpoints");
  app.all(basePath, handler);
  app.all(basePath + "/_next/*", handler);
}

const fallback = (a, b) => (typeof a == "string" && a.length > 0 ? a : `${b}`);

async function getCustomize(): Promise<Customize> {
  /*siteName?: string;
  organizationName?: string;
  termsOfServiceURL?: string;
  contactEmail?: string;*/

  const settings = await callback2(database.get_server_settings_cached, {});
  const customize: Customize = {};
  customize.siteName = fallback(settings.site_name, "On Premises CoCalc");
  customize.organizationName = settings.organization_name;
  customize.termsOfServiceURL = settings.terms_of_service_url;
  customize.contactEmail = fallback(
    customize.organizationName,
    settings.help_email
  );
  return customize;

  /*
  const ANONYMOUS_SIGNUP = !(await have_active_registration_tokens(db));
  const NAME = settings.site_name;
  const DESCRIPTION = settings.site_description;
  const PREFIX = ""; // this is unrelated to the base_path, used for subdirectories
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
  const BASE_PATH = base_path == "/" ? "" : base_path;
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
  */
}
