import { getPool } from "@cocalc/database";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:database-cache");

// createDatabaseCache returns {get, expire}, where get is an async function get()
// that caches its result in the compute_servers_cache and expire() expires the cache
// so the next call with try to compute the value.
//
// If it ever succeeds it will always succeed afterwards, though **possibly
// with stale data but only if there is an error.**
//
// This can be used for expensive grabbing of data, e.g., from an external source like github or
// google cloud, which might be down sometimes, and for which the data is not frequently
// updated.  E.g., a list of docker images that we've built, or the VM images in a cloud.
// It can also be used for reducing load on external data sources, e.g., only calling
// the hyperstack API to get the list of volumes every once in a while, or when we know
// the list has changed.

// NOTE: createDatabaseCache creates a thing for caching *exactly* one thing in the database.
// Examples:
//    -- list of our google cloud images
//    -- our global image spec file
//    -- list of all volumes defined in hyperstack
//    -- hyperstack pricing data

export function createDatabaseCache<T>({
  cloud,
  key,
  ttl,
  fetchData,
}: {
  cloud: string;
  key: string;
  ttl: number; // in milliseconds
  fetchData: () => Promise<T>;
}): { get: () => Promise<T>; expire: () => Promise<void> } {
  const db = getPool();
  // Used by everything else in cocalc to get access to the cached data.
  const getData = async (): Promise<T> => {
    logger.debug(cloud, key, "getData");
    const { rows } = await db.query(
      "SELECT value, expire FROM compute_servers_cache WHERE cloud=$1 AND key=$2",
      [cloud, key],
    );
    if (rows.length == 0) {
      logger.debug(cloud, key, "data not in database at all, so we have fetch");
      return await fetchDataAndUpdateDatabase(true);
    }
    const { value, expire } = rows[0];
    if (expire != null && expire.valueOf() >= Date.now()) {
      // data is still valid
      try {
        return JSON.parse(value);
      } catch (err) {
        logger.debug(
          cloud,
          key,
          "invalid data in database, so just try from scratch",
          err,
        );
      }
    }
    logger.debug(
      cloud,
      key,
      "data expired, so updating from remote, if possible",
    );
    try {
      return await fetchDataAndUpdateDatabase();
    } catch (err) {
      logger.debug(
        cloud,
        key,
        "ERROR: not able to fetch data, but we have a cached old data, so we return that -- ",
        `${err}`,
      );
      // return what we have, even if it is stale.  External sites go down sometimes and we
      // don't want that to totally break everything.
      try {
        // our stale data is broken -- should never happen
        return JSON.parse(value);
      } catch (_) {
        throw err;
      }
    }
  };

  const expireData = async () => {
    await db.query(
      "UPDATE compute_servers_cache SET expire=NOW() WHERE cloud=$1 AND key=$2",
      [cloud, key],
    );
  };

  // Update the data object that is stored in the database, and also return it.
  const fetchDataAndUpdateDatabase = async (insert: boolean = false) => {
    const data = await fetchData();
    const value = JSON.stringify(data);
    const params = [cloud, key, value, new Date(Date.now() + ttl)];
    if (insert) {
      await db.query(
        "INSERT INTO compute_servers_cache(cloud,key,value,expire) VALUES($1,$2,$3,$4)",
        params,
      );
    } else {
      await db.query(
        "UPDATE compute_servers_cache SET value=$3,expire=$4 WHERE cloud=$1 AND key=$2",
        params,
      );
    }
    logger.debug(cloud, key, "successfully updated data");
    return data;
  };

  return { get: getData, expire: expireData };
}
