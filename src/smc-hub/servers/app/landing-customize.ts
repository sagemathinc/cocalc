/*
Create a Javascript object that describes properties of the server.
This is used on the next.js server landing pages to customize
their look and behavior.
*/

import basePath from "smc-util-node/base-path";
import { callback2 } from "smc-util/async-utils";
import { database } from "../database";
import { Customize } from "@cocalc/landing-free/lib/customize";
import { have_active_registration_tokens } from "smc-hub/utils";
import { join } from "path";

const fallback = (a, b) => (typeof a == "string" && a.length > 0 ? a : `${b}`);

export default async function getCustomize(): Promise<Customize> {
  const settings = await callback2(database.get_server_settings_cached, {});
  return {
    siteName: fallback(settings.site_name, "On Premises CoCalc"),
    siteDescription: fallback(
      settings.site_description,
      "Collaborative Calculation using Python, Sage, R, Julia, and more."
    ),

    organizationName: settings.organization_name,
    organizationEmail: settings.organization_email,
    organizationURL: settings.organization_url,
    termsOfServiceURL: settings.terms_of_service_url,

    helpEmail: settings.help_email,
    contactEmail: fallback(settings.organization_email, settings.help_email),

    isCommercial: settings.commercial,

    anonymousSignup: !(await have_active_registration_tokens(database)),

    logoSquareURL: fallback(
      settings.logo_square,
      join(basePath, "webapp/cocalc-icon.svg")
    ),
    logoRectangularURL: fallback(
      settings.logo_rectangular,
      join(basePath, "webapp/open-cocalc-font-dark.svg")
    ),
    splashImage: fallback(
      settings.splash_image,
      join(basePath, "cdn/pix/cocalc-screenshot-20200128-nq8.png")
    ),

    indexInfo: settings.index_info_html,

    basePath,
  };
}
