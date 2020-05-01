/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// These site-settings are visible to any user (read-only)
// They contain information like the site's name, contact email addresses, etc.

import { site_settings_conf } from "./site-defaults";
import { EXTRAS as site_settings_extras } from "./site-settings-extras";
import { keys } from "../misc";

const site_settings_fields = keys(site_settings_conf).concat(
  keys(site_settings_extras)
);

import { Table } from "./types";

Table({
  name: "site_settings",
  rules: {
    virtual: "server_settings",
    anonymous: false,
    user_query: {
      // NOTE: can set and get only fields in site_settings_fields, but not any others.
      get: {
        pg_where: [{ "name = ANY($)": site_settings_fields }],
        admin: true,
        fields: {
          name: null,
          value: null,
        },
      },
      set: {
        admin: true,
        fields: {
          name(obj, _db) {
            if (site_settings_fields.includes(obj.name)) {
              return obj.name;
            }
            throw Error(`setting name='${obj.name}' not allowed`);
          },
          value: null,
        },
      },
    },
  },
});
