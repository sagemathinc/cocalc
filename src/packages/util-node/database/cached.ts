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

import LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";
import getPool from "./pool";
import { Pool } from "pg";

const MAX_AGE_S = {
  short: 5, // just to avoid a very rapid fire sequence of re-requests
  medium: 15, // usually use this.
  long: 30,
  minutes: 10 * 60, // a really long time -- for now, 10 minutes.  example, the owner of a project.
  infinite: 60 * 60 * 24 * 365, // effectively forever; e.g., getting path from share id is really just a reversed sha1 hash, so can't change.
};

export type Length = keyof typeof MAX_AGE_S;

const caches: Map<Length, LRU<string, any>> = new Map();

for (const length in MAX_AGE_S) {
  caches[length] = new LRU<string, any>({
    max: 1000,
    maxAge: 1000 * MAX_AGE_S[length],
  });
}

const cachedQuery = reuseInFlight(async (length: Length, ...args) => {
  const cache = caches[length];
  if (cache == null) {
    throw Error(`invalid cache "${length}"`);
  }
  const key = JSON.stringify(args);
  if (cache.has(key)) {
    // console.log(`YES - using cache for ${key}`);
    return cache.get(key);
  }
  // console.log(`NOT using cache for ${key}`);

  const pool = getPool();
  // @ts-ignore - no clue how to typescript this.
  const result = await pool.query(...args);
  if (result.rows.length > 0) {
    // We only cache query if it returned something.
    cache.set(key, result);
  }
  return result;
});

export default function getCachedPool(length: Length) {
  return {
    query: async (...args) => await cachedQuery(length, ...args),
  } as any as Pool; // obviously not really a Pool, but is enough for what we're doing.
}
