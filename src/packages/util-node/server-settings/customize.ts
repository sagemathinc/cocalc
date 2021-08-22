import { join } from "path";
import basePath from "../base-path";
import getServerSettings from "./server-settings";

export interface Customize {
  siteName?: string;
  siteDescription?: string;
  organizationName?: string;
  organizationEmail?: string;
  organizationURL?: string;
  termsOfServiceURL?: string;
  helpEmail?: string;
  contactEmail?: string;
  isCommercial?: boolean;
  anonymousSignup?: boolean;
  logoSquareURL?: string;
  logoRectangularURL?: string;
  splashImage?: string;
  indexInfo?: string;
  basePath: string;
  appBasePath: string;
  dns?: string;
}

const fallback = (a, b) => (typeof a == "string" && a.length > 0 ? a : `${b}`);

/*
Create a Javascript object that describes properties of the server.
This is used on the next.js server landing pages and the share server
to customize their look and behavior.
*/

export default async function getCustomize(): Promise<Customize> {
  const settings = await getServerSettings();

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

    anonymousSignup: settings.anonymous_signup,

    logoSquareURL: fallback(
      settings.logo_square,
      join(basePath, "webapp/cocalc-icon.svg")
    ),
    logoRectangularURL: fallback(
      settings.logo_rectangular,
      "webapp/open-cocalc-font-dark.svg"
    ),
    splashImage: fallback(
      settings.splash_image,
      "cdn/pix/cocalc-screenshot-20200128-nq8.png"
    ),

    indexInfo: settings.index_info_html,

    basePath,
    appBasePath: basePath,

    // can be used for links to edit share document in main site; needed if main site
    // on different domain than share server, e.g., share.cocalc.com vs cocalc.com.
    dns: settings.dns,
  } as Customize;
}
