/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import LRU from "lru-cache";
import {
  AllSiteSettingsCached as ServerSettings,
  AllSiteSettingsKeys,
} from "@cocalc/util/db-schema/types";
export type { ServerSettings };
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { site_settings_conf as CONF } from "@cocalc/util/schema";
import { SERVER_SETTINGS_ENV_PREFIX } from "@cocalc/util/consts";
import getPool from "@cocalc/database/pool";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import getLogger from "@cocalc/backend/logger";
const L = getLogger("server:server-settings");

// We're just using this to cache this result for a **few seconds**.
const CACHE_TIME_SECONDS = process.env.NODE_ENV == "development" ? 3 : 15;
type CacheKeys = "server-settings" | "passports";
// TODO add something for the passports data type?
const cache = new LRU<CacheKeys, ServerSettings>({
  max: 10,
  maxAge: 1000 * CACHE_TIME_SECONDS,
});
const KEY: CacheKeys = "server-settings";

export function resetServerSettingsCache() {
  cache.reset();
}

export function getPassportsCached() {
  return cache.get("passports");
}

export function setPassportsCached(val) {
  return cache.set("passports", val);
}

export async function getServerSettings(): Promise<ServerSettings> {
  if (cache.has(KEY)) {
    return cache.get(KEY)!; // can't be null
  }
  const pool = getPool();
  const { rows } = await pool.query("SELECT name, value FROM server_settings");

  const settings: ServerSettings = { _timestamp: Date.now() };

  const raw: { [key in AllSiteSettingsKeys]?: string } = {};
  for (const row of rows) {
    raw[row.name] = row.value;
  }

  // process values, including any post-processing.
  for (const row of rows) {
    const { name, value } = row;
    const spec = CONF[name] ?? EXTRAS[name];
    // we only process values we know
    if (spec == null) continue;
    const toVal = spec.to_val;
    settings[name] = toVal != null ? toVal(value, raw) : value;
  }
  // set default values for missing keys
  for (const config of [EXTRAS, CONF]) {
    for (const key in config) {
      if (settings[key] == null) {
        const spec = config[key];
        settings[key] =
          spec?.to_val != null ? spec.to_val(spec.default, raw) : spec.default;
      }
    }
  }

  cache.set(KEY, settings);
  return settings;
}

/*
This stores environment variables for server settings in the DB to make the life of an admin easier.
e.g. COCALC_SETTING_DNS, COCALC_SETTING_EMAIL_SMTP_SERVER, COCALC_SETTING_EMAIL_SMTP_PASSWORD, ...
Loaded once at startup, right after configuring the db schema, see hub/hub.ts.
*/
export async function load_server_settings_from_env(
  db: PostgreSQL
): Promise<void> {
  const PREFIX = SERVER_SETTINGS_ENV_PREFIX;
  // reset all readonly values
  await db.async_query({
    query: "UPDATE server_settings",
    set: { readonly: false },
    where: ["1=1"], // otherwise there is an exception about not restricting the query
  });
  // now, check if there are any we know of
  for (const config of [EXTRAS, CONF]) {
    for (const key in config) {
      const envvar = `${PREFIX}_${key.toUpperCase()}`;
      const envval = process.env[envvar];
      if (envval == null) continue;
      // ATTN do not expose the value, could be a password
      L.debug(`picking up $${envvar} and saving it in the database`);

      // check validity
      const valid = (CONF[key] ?? EXTRAS[key])?.valid;
      if (valid != null) {
        if (Array.isArray(valid) && !valid.includes(envval)) {
          throw new Error(
            `The value of $${envvar} is invalid. allowed are ${valid}.`
          );
        } else if (typeof valid == "function" && !valid(envval)) {
          throw new Error(
            `The validation function rejected the value of $${envvar}.`
          );
        }
      }

      await cb2(db.set_server_setting, {
        name: key,
        value: envval,
        readonly: true,
      });
    }
  }
}
