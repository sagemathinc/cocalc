/*
initDatabaseCache - -A version of some of the functions from ./client.ts, but
with database-level caching.

Multiple distinct processes get a consistent view of things,
with cache invalidation, but we can significantly reduce
requests to the remote hyperstack api.

NOTE: initTTLCache is an in-memory cache, but this is only useful if there is only
one nodejs process involved, since our code assumes that everything has a
consistent view of the cache.
*/

import { initCache } from "./client";
import TTLCache from "@isaacs/ttlcache";
import json from "json-stable-stringify";
import { createTTLCache } from "@cocalc/server/compute/database-cache";

// We cache results for this many minutes, unless we explicitly
// invalidate the cache (e.g., if we create a new volume).
const CACHE_TIME_M = 5;

export function initTTLCache() {
  const ttlCache = new TTLCache({ ttl: CACHE_TIME_M * 60 * 1000 });

  const cache = {
    set: async (key, value) => {
      ttlCache.set(json(key), value);
    },
    get: async (key) => {
      return ttlCache.get(json(key));
    },
    delete: async (key) => {
      ttlCache.delete(json(key));
    },
    has: async (key) => {
      return ttlCache.has(json(key));
    },
  };

  initCache(cache);
}

export function initDatabaseCache() {
  const cache = createTTLCache({
    ttl: CACHE_TIME_M * 60 * 1000,
    cloud: "hyperstack",
  });
  initCache(cache);
}
