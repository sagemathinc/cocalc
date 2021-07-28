/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// dynamically generate the manifest json file – for html5 web app's

import { Response } from "express";
import { join } from "path";
import { SiteSettingsKeys } from "smc-util/db-schema/site-defaults";
import base_path from "smc-util-node/base-path";

interface Custom {
  configuration: Record<SiteSettingsKeys, string>;
}

export function send(res: Response, custom: Custom) {
  const config = custom.configuration;

  // See https://developer.mozilla.org/en-US/docs/Web/Manifest, which says
  // "the response of the manifest file should return Content-Type: application/manifest+json)"
  res.header("Content-Type", "application/manifest+json");

  const base_app = join(base_path, "app");

  const manifest = {
    name: config.site_name,
    short_name: config.site_name,
    start_url: `${base_app}?utm_medium=manifest`,
    scope: base_path,
    display: "minimal-ui",
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

  res.send(JSON.stringify(manifest, null, 2));
}
