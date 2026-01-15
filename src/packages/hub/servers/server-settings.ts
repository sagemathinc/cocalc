/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Synchronized table that tracks server settings.
*/

import { isEmpty } from "lodash";
import { once } from "@cocalc/util/async-utils";
import { EXTRAS as SERVER_SETTINGS_EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { buildPublicSiteSettings } from "@cocalc/util/db-schema/site-settings-public";
import { AllSiteSettings } from "@cocalc/util/db-schema/types";
import { startswith } from "@cocalc/util/misc";
import { site_settings_conf as SITE_SETTINGS_CONF } from "@cocalc/util/schema";
import { database } from "./database";

// Returns:
//   - all: a mutable javascript object that is a map from each server setting to its current value.
//                      This includes VERY private info (e.g., stripe private key)
//   - pub: similar, but only subset of public info that is needed for browser UI rendering.
//   - version
//   - table: the table, so you can watch for on change events...
// These get automatically updated when the database changes.

export interface ServerSettingsDynamic {
  all: AllSiteSettings;
  pub: object;
  version: {
    version_min_browser?: number;
    version_recommended_browser?: number;
    version_min_project?: number;
  };
  table: any;
}

let serverSettings: ServerSettingsDynamic | undefined = undefined;

export default async function getServerSettings(): Promise<ServerSettingsDynamic> {
  if (serverSettings != null) {
    return serverSettings;
  }
  const table = database.server_settings_synctable();
  serverSettings = { all: {}, pub: {}, version: {}, table: table };
  const { all, pub, version } = serverSettings;
  const update = async function () {
    const allRaw = {};
    table.get().forEach((record, field) => {
      allRaw[field] = record.get("value");
    });

    table.get().forEach(function (record, field) {
      const rawValue = record.get("value");

      // process all values from the database according to the optional "to_val" mapping function
      const spec = SITE_SETTINGS_CONF[field] ?? SERVER_SETTINGS_EXTRAS[field];
      if (typeof spec?.to_val == "function") {
        all[field] = spec.to_val(rawValue, allRaw);
      } else {
        if (typeof rawValue == "string" || typeof rawValue == "boolean") {
          all[field] = rawValue;
        }
      }

      // Normalize version fields (used elsewhere too)
      if (SITE_SETTINGS_CONF[field] && startswith(field, "version_")) {
        const field_val: number = (all[field] = parseInt(all[field]));
        if (isNaN(field_val) || field_val * 1000 >= new Date().getTime()) {
          // Guard against horrible error in which version is in future (so impossible) or NaN (e.g., an invalid string pasted by admin).
          // In this case, just use 0, which is always satisifed.
          all[field] = 0;
        }
      }
    });

    // set all default values
    for (const config of [SITE_SETTINGS_CONF, SERVER_SETTINGS_EXTRAS]) {
      for (const field in config) {
        if (all[field] == null) {
          const spec = config[field];
          const fallbackVal =
            spec?.to_val != null
              ? spec.to_val(spec.default, allRaw)
              : spec.default;
          // we don't bother to set empty strings or empty arrays
          if (
            (typeof fallbackVal === "string" && fallbackVal === "") ||
            (Array.isArray(fallbackVal) && isEmpty(fallbackVal))
          )
            continue;
          all[field] = fallbackVal;
        }
      }
    }

    // PRECAUTION: never make the required version bigger than version_recommended_browser. Very important
    // not to stupidly completely eliminate all cocalc users by a typo...
    for (const x of ["project", "browser"]) {
      const field = `version_min_${x}`;
      const minver = all[field] || 0;
      const recomm = all["version_recommended_browser"] || 0;
      all[field] = Math.min(minver, recomm);
    }

    const { configuration, version: nextVersion } =
      buildPublicSiteSettings(all);
    for (const key of Object.keys(pub)) {
      delete pub[key];
    }
    Object.assign(pub, configuration);
    for (const key of Object.keys(version)) {
      delete version[key];
    }
    Object.assign(version, nextVersion);
    for (const [key, value] of Object.entries(nextVersion)) {
      all[key] = value;
    }
  };
  table.on("change", update);
  table.on("init", update);
  await once(table, "init");
  return serverSettings;
}
