/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import LRU from "lru-cache";

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { PassportStrategyDB } from "@cocalc/server/auth/sso/types";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { SERVER_SETTINGS_ENV_PREFIX } from "@cocalc/util/consts";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import {
  AllSiteSettingsKeys,
  AllSiteSettingsCached as ServerSettings,
} from "@cocalc/util/db-schema/types";
import { secure_random_token } from "@cocalc/util/misc";
import { site_settings_conf as CONF } from "@cocalc/util/schema";

export type { ServerSettings };

const L = getLogger("server:server-settings");

// We're just using this to cache this result for a **few seconds**.
const CACHE_TIME_SECONDS = process.env.NODE_ENV == "development" ? 3 : 60;
type CacheKeys = "server-settings" | "passports";
// TODO add something for the passports data type?
const cache = new LRU<CacheKeys, ServerSettings | PassportStrategyDB[]>({
  max: 10,
  ttl: 1000 * CACHE_TIME_SECONDS,
});
const KEY: CacheKeys = "server-settings";

export function resetServerSettingsCache() {
  cache.clear();
}

export function getPassportsCached(): PassportStrategyDB[] | undefined {
  return cache.get("passports") as PassportStrategyDB[] | undefined;
}

export function setPassportsCached(val: PassportStrategyDB[]) {
  return cache.set("passports", val);
}

export async function getServerSettings(): Promise<ServerSettings> {
  if (cache.has(KEY)) {
    return cache.get(KEY)! as ServerSettings; // can't be null
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

/**
 * If the field "email_shared_secret" is not set, then set it to a random string using sha1.
 */
export async function initEmailSharedSecret(db: PostgreSQL): Promise<void> {
  const { email_shared_secret: ess } = await getServerSettings();
  if (typeof ess === "string" && ess.length > 0) return;
  const secret = secure_random_token(32);
  await cb2(db.set_server_setting, {
    name: "email_shared_secret",
    value: secret,
  });
}

/**
 * If the "password_reset_smtp_server" field exists in the server settings and is not an empty string,
 * Then copy all the password_reset_smtp_* fields to email_smtp2_* fields.
 * Then delete the password_reset_smtp_* fields.
 */
export async function convertPasswordResetSMTPtoSMTP2(
  db: PostgreSQL
): Promise<void> {
  const pool = getPool();

  // test, if "password_reset_override" exists in the server settings
  // below, it will be removed after conversion
  const { rows: rows2 } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name = $1",
    ["password_reset_override"]
  );
  if (rows2.length === 0) return;

  // we need all values without processing or filtering by key!
  const { rows } = await pool.query("SELECT name, value FROM server_settings");
  const values: { [name: string]: string } = {};
  for (const row of rows) {
    values[row.name] = row.value;
  }

  const { password_reset_smtp_server } = values;

  if (
    typeof password_reset_smtp_server === "string" &&
    password_reset_smtp_server.length > 0
  ) {
    const keys = [
      "password_reset_smtp_server",
      "password_reset_smtp_from",
      "password_reset_smtp_login",
      "password_reset_smtp_password",
      "password_reset_smtp_port",
      "password_reset_smtp_secure",
    ];
    for (const key of keys) {
      const value = values[key];
      if (typeof value === "string" && value.length > 0) {
        const name = key.replace("password_reset_smtp_", "email_smtp2_");
        await cb2(db.set_server_setting, { name, value });
      }
    }
    for (const key of keys) {
      await pool.query("DELETE FROM server_settings WHERE name = $1", [key]);
    }
    await pool.query("DELETE FROM server_settings WHERE name = $1", [
      "password_reset_override",
    ]);
  }
  resetServerSettingsCache();
}
