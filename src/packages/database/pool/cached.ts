/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Caches queries for a certain amount of time.
Also, if there are multiple queries coming in
at the same time for the same thing, only
one actually goes to the database.

IMPORTANT: This *only* caches a query if the query actually
returns at least one row.  If the query returns nothing,
that fact is not cached.  This is usually what we want, e.g.,
if somebody access https://cocalc.com/wstein/myproject, and
notices that myproject isn't the set name, then they may
set it and immediately try  https://cocalc.com/wstein/myproject again.
In that case, we don't want to the cache to mean that they don't
see the page for a while. On the other hand, if querying for the
project that myproject resolves to is cached for a minute that is
fine, since this would only be a problem when they change the name
of multiple projects.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import LRU from "lru-cache";
import { Pool } from "pg";

import getLogger from "@cocalc/backend/logger";
import getPool from "./pool";

const L = getLogger("db:pool:cached");

const MAX_AGE_S = {
  "": 0, // no cache at all
  short: 5, // just to avoid a very rapid fire sequence of re-requests
  medium: 15, // usually use this.
  long: 30,
  minutes: 10 * 60, // a really long time -- for now, 10 minutes.  example, the owner of a project.
  infinite: 60 * 60 * 24 * 365, // effectively forever; e.g., getting path from share id is really just a reversed sha1 hash, so can't change.
} as const;

export type CacheTime = keyof typeof MAX_AGE_S;

const caches = new Map<CacheTime, LRU<string, any>>();

for (const cacheTime in MAX_AGE_S) {
  if (!cacheTime) continue;
  caches[cacheTime] = new LRU<string, any>({
    max: 1000,
    ttl: 1000 * MAX_AGE_S[cacheTime],
  });
}

const cachedQuery = reuseInFlight(async (cacheTime: CacheTime, ...args) => {
  const cache = caches[cacheTime];
  if (cache == null) {
    throw Error(`invalid cache "${cacheTime}"`);
  }
  const key = JSON.stringify(args);
  if (cache.has(key)) {
    // console.log(`YES - using cache for ${key}`);
    return cache.get(key);
  }
  // console.log(`NOT using cache for ${key}`);

  const pool = getPool();
  try {
    // @ts-ignore - no clue how to typescript this.
    const result = await pool.query(...args);
    if (result.rows.length > 0) {
      // We only cache query if it returned something.
      cache.set(key, result);
    }
    return result;
  } catch (err) {
    L.error(`cachedQuery error: ${err}`);
    throw err;
  }
});

export default function getCachedPool(cacheTime: CacheTime) {
  if (!cacheTime) {
    return getPool();
  }
  return {
    query: async (...args) => await cachedQuery(cacheTime, ...args),
  } as any as Pool; // obviously not really a Pool, but is enough for what we're doing.
}
