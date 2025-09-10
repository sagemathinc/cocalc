/*
Database backed cache of data from external cloud providers.

There are two different interfaces for using the same database
table via a ttl-cache style api:

- createTTLCache: cache with set/get/has/delete functions that is
  similar to @isaacs/ttlcache, but using the database.

- createDatabaseCachedResource<T>: caches one single piece of data of type T
  (associated to a cloud and named key) and handles fetching it and automatically
  keeps stale data in case of remote failure.

In all cases the key can be any json-able object.

You can also specify a string to be prefixed to the (post-json) keys, to provide
another level of namespacing.
*/

import { getPool } from "@cocalc/database";
import json from "json-stable-stringify";
import getLogger from "@cocalc/backend/logger";
import isAdmin from "@cocalc/server/accounts/is-admin";

const logger = getLogger("server:compute:database-cache");

export interface Cache {
  set: (key, value) => Promise<void>;
  has: (key) => Promise<boolean>;
  get: (key) => Promise<any>;
  delete: (key) => Promise<void>;
}

export function createTTLCache({
  cloud,
  ttl,
  prefix = "",
}: {
  cloud: string;
  ttl: number; // in milliseconds
  prefix?: string; // automatically prepend this prefix to all keys (basically another namespace under cloud)
}): Cache {
  const db = getPool();
  const keyToString = prefix
    ? (key) => `${prefix}-${json(key)}`
    : (key) => json(key);
  return {
    set: async (key, value) => {
      const expire = new Date(Date.now() + ttl);
      await db.query(
        "INSERT INTO compute_servers_cache(cloud,key,value,expire) VALUES($1,$2,$3,$4) ON CONFLICT(cloud,key) DO UPDATE SET value=$3, expire=$4",
        [cloud, keyToString(key), JSON.stringify(value), expire],
      );
    },

    get: async (key) => {
      const { rows } = await db.query(
        "SELECT value FROM compute_servers_cache WHERE cloud=$1 AND key=$2 AND expire > NOW()",
        [cloud, keyToString(key)],
      );
      return rows[0]?.value == null ? undefined : JSON.parse(rows[0]?.value);
    },

    has: async (key) => {
      const { rows } = await db.query(
        "SELECT COUNT(*) AS count FROM compute_servers_cache WHERE cloud=$1 AND key=$2 AND expire > NOW()",
        [cloud, keyToString(key)],
      );
      return (rows[0]?.count ?? 0) > 0;
    },

    delete: async (key) => {
      await db.query(
        "DELETE FROM compute_servers_cache WHERE cloud=$1 AND key=$2",
        [cloud, keyToString(key)],
      );
    },
  };
}

// createDatabaseCache returns {get, expire}, where get is an async function get()
// that caches its result in the compute_servers_cache and expire() expires the cache
// so the next call with try to compute the value.
//
// If it ever succeeds it will always succeed afterwards, though **possibly
// with stale data but only if there is an error.**
//
// To not get value from the cache:
//      await get({noCache:true})
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

type GetFunction<T> = (opts?: { noCache?: boolean }) => Promise<T>;

export function createDatabaseCachedResource<T>({
  cloud,
  key,
  ttl,
  fetchData,
}: {
  cloud: string;
  key;
  ttl: number; // in milliseconds
  fetchData: () => Promise<T>;
}): { get: GetFunction<T>; expire: () => Promise<void> } {
  const db = getPool();
  key = json(key);
  // Used by everything else in cocalc to get access to the cached data.
  const getData: GetFunction<T> = async ({
    noCache,
    account_id,
  }: { noCache?: boolean; account_id?: string } = {}): Promise<T> => {
    logger.debug(cloud, key, "getData");
    const { rows } = await db.query(
      "SELECT value, expire FROM compute_servers_cache WHERE cloud=$1 AND key=$2",
      [cloud, key],
    );
    if (rows.length == 0) {
      logger.debug(cloud, key, "data not in database at all, so we have fetch");
      return await fetchDataAndUpdateDatabase(true);
    }
    if (noCache && (await isAdmin(account_id))) {
      return await fetchDataAndUpdateDatabase();
    }
    const { value, expire } = rows[0];
    if (expire != null && expire.valueOf() >= Date.now()) {
      // data is still valid
      try {
        return value == null ? value : JSON.parse(value);
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
