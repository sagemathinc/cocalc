/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getStrategies from "@cocalc/database/settings/get-sso-strategies";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import type { Strategy } from "@cocalc/util/types/sso";
import { ServerSettings, getServerSettings } from "./server-settings";
import siteURL from "./site-url";
import { copy_with } from "@cocalc/util/misc";
import type { Customize } from "@cocalc/util/db-schema/server-settings";
export type { Customize };

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
export default async function getCustomize(
  fields?: string[],
): Promise<Customize> {
  const [settings, strategies]: [ServerSettings, Strategy[]] =
    await Promise.all([getServerSettings(), getStrategies()]);

  if (!(settings === cachedSettings && cachedCustomize != null)) {
    cachedSettings = settings;
    cachedCustomize = {
      siteName: fallback(settings.site_name, "On Premises CoCalc"),
      siteDescription: fallback(
        settings.site_description,
        "Collaborative Calculation using Python, Sage, R, Julia, and more.",
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
      sshGatewayDNS: settings.ssh_gateway_dns,

      anonymousSignup: settings.anonymous_signup,
      anonymousSignupLicensedShares: settings.anonymous_signup_licensed_shares,
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
      indexTagline: settings.index_tagline,
      imprint: settings.imprint,
      policies: settings.policies,
      support: settings.support,
      supportVideoCall: settings.support_video_call,

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

      // a sandbox project
      sandboxProjectId: settings.sandbox_project_id,
      sandboxProjectsEnabled: settings.sandbox_projects_enabled,

      // true if openai integration is enabled -- this impacts the UI only, and can be
      // turned on and off independently of whether there is an api key set.
      openaiEnabled: settings.openai_enabled,
      // same for google vertex (exposed as gemini), and others
      googleVertexaiEnabled: settings.google_vertexai_enabled,
      mistralEnabled: settings.mistral_enabled,
      anthropicEnabled: settings.anthropic_enabled,
      ollamaEnabled: settings.ollama_enabled,

      // if extra Jupyter API functionality for sandboxed ephemeral code execution is available.
      jupyterApiEnabled: settings.jupyter_api_enabled,

      computeServersEnabled: settings.compute_servers_enabled,
      cloudFilesystemsEnabled: settings.cloud_filesystems_enabled,

      // GitHub proxy project
      githubProjectId: settings.github_project_id,

      // public info about SSO strategies
      strategies,

      verifyEmailAddresses: settings.verify_emails && settings.email_enabled,

      version: {
        min_project: parseInt(settings.version_min_project),
        min_compute_server: parseInt(settings.version_min_compute_server),
        min_browser: parseInt(settings.version_min_browser),
        recommended_browser: parseInt(settings.version_recommended_browser),
        compute_server_min_project: parseInt(
          settings.version_compute_server_min_project,
        ),
      },
    };
  }
  return fields ? copy_with(cachedCustomize, fields) : cachedCustomize;
}
