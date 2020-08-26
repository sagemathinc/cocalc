/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is for the commerical setup only!
// The basic idea is to allow whitelabeling for specific subdomains.
// This works by sending the "site-default" configuration,
// but with modifications coming from an entry in this table.
// In particular, we (only) allow to set fields in ThemeKeys.

// TODO: for now, this is backend only. example DB query:
/*
INSERT INTO whitelabeling (id, theme)
VALUES ('vanity', '{"site_name":"Vanity", "site_description": "A vanity address test setup", "help_email": "hsy+vanity@cocalc.com"}'::JSONB)
ON CONFLICT(id) DO UPDATE SET theme=EXCLUDED.theme;
*/

import { keys } from "../misc";
import { SiteSettingsKeys } from "./site-defaults";

// a subset of all site settings
export const ThemeKeys: SiteSettingsKeys[] = [
  "site_name", // this is sort of required as well
  "site_description",
  "dns", // this is a required field
  "account_creation_email_instructions",
  "help_email",
  "logo_square",
  "logo_rectangular",
  "splash_image",
  "index_info_html",
  "organization_name",
  "organization_email",
  "organization_url",
];

import { Table } from "./types";

function check_hook(_db, obj, _account_id, _project_id, cb): void {
  for (const tk in keys(obj.theme)) {
    // TS: requires explicit lift to strings[] to make this check
    if (!(ThemeKeys as string[]).includes(tk)) {
      cb(`Unknown key in theme: "${tk}"`);
      return;
    }
  }
  cb();
}

Table({
  name: "whitelabeling",
  fields: {
    id: {
      type: "string",
      desc: "the vanity subdomain",
    },
    theme: {
      type: "map",
      desc: "a map of {[key:ThemeKeys] : string}",
    },
  },
  rules: {
    desc: "Whitelabeling Themes",
    primary_key: "id",
    anonymous: false,
    user_query: {
      get: {
        admin: true,
        fields: {
          id: null,
          theme: null,
        },
        check_hook,
      },
      set: {
        admin: true,
        fields: {
          id: null,
          theme: null,
        },
        check_hook,
      },
    },
  },
});
