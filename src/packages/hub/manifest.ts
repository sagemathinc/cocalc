/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// dynamically generate the manifest json file – for html5 web app's

import { Response } from "express";
import { join } from "path";
import { SiteSettingsKeys } from "@cocalc/util/db-schema/site-defaults";
import base_path from "@cocalc/backend/base-path";

// Control PWA installability -- https://github.com/sagemathinc/cocalc/issues/8474
// Keeps theme colors and styling but prevents Chrome's "Install app" prompt
const ENABLE_PWA_INSTALL = false;

interface Custom {
  configuration: Record<SiteSettingsKeys, string>;
}

export function send(res: Response, custom: Custom) {
  const config = custom.configuration;

  // See https://developer.mozilla.org/en-US/docs/Web/Manifest, which says
  // "the response of the manifest file should return Content-Type: application/manifest+json)"
  res.header("Content-Type", "application/manifest+json");

  const base_app = join(base_path, "app");

  const manifest: any = {
    name: config.site_name,
    short_name: config.site_name,
    start_url: `${base_app}?utm_medium=manifest`,
    scope: base_path,
    background_color: "#fbb635",
    theme_color: "#4474c0",
    description: config.site_description,
    icons: [
      {
        src:
          config.logo_square ??
          "https://storage.googleapis.com/cocalc-extra/cocalc-icon-white-fillin.256px.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
  };

  // Without that display property, browsers won't show the "Install app" prompt
  if (ENABLE_PWA_INSTALL) {
    manifest.display = "minimal-ui";
  }

  res.send(JSON.stringify(manifest, null, 2));
}
