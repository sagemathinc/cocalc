import LRU from "lru-cache";
import { AllSiteSettingsCached as ServerSettings } from "@cocalc/util/db-schema/types";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { site_settings_conf as CONF } from "@cocalc/util/schema";
import getPool from "@cocalc/database/pool";

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

  // process values, including any post-processing.
  for (const row of rows) {
    const { name, value } = row;
    const toVal = (CONF[name] ?? EXTRAS[name])?.to_val;
    settings[name] = toVal != null ? toVal(value) : value;
  }
  // set default values for missing keys
  for (const config of [EXTRAS, CONF]) {
    for (const key in config) {
      if (settings[key] == null) {
        const conf = config[key];
        settings[key] =
          conf?.to_val != null ? conf.to_val(conf.default) : conf.default;
      }
    }
  }

  cache.set(KEY, settings);
  return settings;
}
