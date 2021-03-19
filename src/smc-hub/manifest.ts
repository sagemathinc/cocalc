/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// dynamically generate the manifest json file – for html5 web app's

import { Response } from "express";
import { join } from "path";
import { SiteSettingsKeys } from "../smc-util/db-schema/site-defaults";

interface Custom {
  configuration: Record<SiteSettingsKeys, string>;
}

export function send(res: Response, custom: Custom, base_url: string) {
  const config = custom.configuration;

  res.header("Content-Type", "application/json");

  console.log(JSON.stringify(config, null, 2));

  const manifest = {
    name: config.site_name,
    short_name: config.site_name,
    start_url: `.${join("/", base_url, "app")}/?utm_medium=manifest`,
    display: "standalone",
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

  res.end(JSON.stringify(manifest, null, 2));
}
