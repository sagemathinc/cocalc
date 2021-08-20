import LRU from "lru-cache";
import { AllSiteSettingsCached as ServerSettings } from "@cocalc/util/db-schema/types";
import { EXTRAS } from "@cocalc/util/db-schema/site-settings-extras";
import { site_settings_conf as CONF } from "@cocalc/util/schema";

// async function that does a PostgreSQL query.
export type DatabaseQuery = (...args) => Promise<any>;

// We're just using this to cache one result for a while.  This could
// be done with a simpler cache, but it's nice to use one cache everywhere.
const CACHE_TIME_SECONDS = process.env.NODE_ENV == "development" ? 3 : 15;
const cache = new LRU<"key", ServerSettings>({
  max: 1,
  maxAge: 1000 * CACHE_TIME_SECONDS,
});
const KEY: "key" = "key"; // just one key :-)

export default async function getServerSettings(
  dbQuery: DatabaseQuery
): Promise<ServerSettings> {
  if (cache.has(KEY)) {
    return cache.get(KEY)!; // can't be null
  }
  const { rows } = await dbQuery("SELECT name, value FROM server_settings");

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
      if (!settings[key]) {
        const conf = config[key];
        settings[key] =
          conf?.to_val != null ? conf.to_val(conf.default) : conf.default;
      }
    }
  }

  cache.set(KEY, settings);
  return settings;
}
