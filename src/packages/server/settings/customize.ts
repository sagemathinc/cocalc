/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getServerSettings, ServerSettings } from "./server-settings";
import siteURL from "./site-url";
import { KucalcValues } from "@cocalc/util/db-schema/site-defaults";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";

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
  kucalc?: KucalcValues;
  sshGateway?: boolean;
  logoSquareURL?: string;
  logoRectangularURL?: string;
  splashImage?: string;
  indexInfo?: string;
  shareServer?: boolean;
  landingPages?: boolean;
  dns?: string;
  siteURL?: string;
  googleAnalytics?: string;
  anonymousSignup?: boolean;
  emailSignup?: boolean;
  accountCreationInstructions?: string;
  zendesk?: boolean; // true if zendesk support is configured.
  stripePublishableKey?: string;
  index_info_html?: string;
  imprint_html?: string;
  policies_html?: string;
  reCaptchaKey?: string;
}

const fallback = (a?: string, b?: string): string =>
  typeof a == "string" && a.length > 0 ? a : `${b}`;

/*
Create a Javascript object that describes properties of the server.
This is used on the next.js server landing pages and the share server
to customize their look and behavior.

This function is cached via the parameters in ./server-settings, i.e.,
for a few seconds.
*/

let cachedSettings: ServerSettings | undefined = undefined;
let cachedCustomize: Customize | undefined = undefined;
export default async function getCustomize(): Promise<Customize> {
  const settings = await getServerSettings();
  if (settings === cachedSettings && cachedCustomize != null) {
    return cachedCustomize;
  }
  cachedSettings = settings;
  cachedCustomize = {
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

    kucalc: settings.kucalc,
    sshGateway: settings.ssh_gateway,

    anonymousSignup: settings.anonymous_signup,
    emailSignup: settings.email_signup,
    accountCreationInstructions: settings.account_creation_email_instructions,

    logoSquareURL: settings.logo_square,
    logoRectangularURL: settings.logo_rectangular,
    splashImage: settings.splash_image,

    shareServer: !!settings.share_server,

    // additionally restrict showing landing pages only in cocalc.com-mode
    landingPages:
      !!settings.landing_pages && settings.kucalc === KUCALC_COCALC_COM,

    googleAnalytics: settings.google_analytics,

    indexInfo: settings.index_info_html,
    imprint: settings.imprint,
    policies: settings.policies,

    // Is important for invite emails, password reset, etc. (e.g., so we can construct a url to our site).
    // This *can* start with http:// to explicitly use http instead of https, and can end
    // in something like :3594 to indicate a port.
    dns: settings.dns,
    // siteURL is derived from settings.dns and the basePath -- it combines the dns, https://
    // and the basePath.  It never ends in a slash.  This is used in practice for
    // things like invite emails, password reset, etc.
    siteURL: await siteURL(settings.dns),

    zendesk:
      settings.zendesk_token &&
      settings.zendesk_username &&
      settings.zendesk_uri,

    // obviously only the public key here!
    stripePublishableKey: settings.stripe_publishable_key,

    // obviously only the public key here too!
    reCaptchaKey: settings.re_captcha_v3_publishable_key,
  } as Customize;

  return cachedCustomize;
}
