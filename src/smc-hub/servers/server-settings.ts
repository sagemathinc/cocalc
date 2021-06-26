/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Synchronized table that tracks server settings.
*/

import { site_settings_conf } from "smc-util/db-schema";
import { startswith } from "smc-util/misc";
import { once } from "smc-util/async-utils";
import { have_active_registration_tokens } from "../utils";
import { database } from "./database";

// Returns:
//   - all: a mutable javascript object that is a map from each server setting to its current value.
//                      This includes VERY private info (e.g., stripe private key)
//   - pub: similar, but only subset of public info that is needed for browser UI rendering.
//   - version
//   - table: the table, so you can watch for on change events...
// These get automatically updated when the database changes.

interface ServerSettings {
  all: object;
  pub: object;
  version: object;
  table: any;
}

let serverSettings: ServerSettings | undefined = undefined;

export default async function getServerSettings(): Promise<ServerSettings> {
  if (serverSettings != null) {
    return serverSettings;
  }
  const table = database.server_settings_synctable();
  serverSettings = { all: {}, pub: {}, version: {}, table: table };
  const { all, pub, version } = serverSettings;
  const update = async function () {
    table.get().forEach(function (record, field) {
      all[field] = record.get("value");
      if (site_settings_conf[field]) {
        if (startswith(field, "version_")) {
          const field_val: number = (all[field] = parseInt(all[field]));
          if (isNaN(field_val) || field_val * 1000 >= new Date().getTime()) {
            // Guard against horrible error in which version is in future (so impossible) or NaN (e.g., an invalid string pasted by admin).
            // In this case, just use 0, which is always satisifed.
            all[field] = 0;
          }
          version[field] = all[field];
        }
        pub[field] = all[field];
      }
    });

    // PRECAUTION: never make the required version bigger than version_recommended_browser. Very important
    // not to stupidly completely eliminate all cocalc users by a typo...

    for (const x of ["project", "browser"]) {
      const field = `version_min_${x}`;
      const minver = all[field] || 0;
      const recomm = all["version_recommended_browser"] || 0;
      pub[field] = version[field] = all[field] = Math.min(minver, recomm);
    }

    // finally, signal the front end if it allows users to anonymously sign in
    // OLD: this is currently derived from the existence of the sign up token
    // NEW (past july 2020): there is a regisrtation token table
    pub["allow_anonymous_sign_in"] = !(await have_active_registration_tokens(
      database
    ));
  };
  table.on("change", update);
  table.on("init", update);
  await once(table, "init");
  return serverSettings;
}
