/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import LRU from "lru-cache";
import { Pool } from "pg";

import { sha1 } from "@cocalc/backend/misc_node";
import getPool from "@cocalc/database/pool";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

interface LRUQueryCacheOpts {
  size?: number;
  ttl_s?: number;
}

export type QueryCacheArgs = Array<string | number | Date>;

/**
 * A simple LRU cache for postgres queries. This is better than getPool("some string"),
 * because you're more in control, sha1 key sums to avoid sticking large keys in the cache,
 * and you can clear the cache any time if you want.
 */
export class LRUQueryCache {
  private cache: LRU<string, unknown[]>;
  private pool: Pool;

  private queryInFlight = reuseInFlight(
    async (
      query: string,
      args: QueryCacheArgs = [],
      cached = true,
    ): Promise<unknown[]> => {
      const key = sha1(JSON.stringify([query, ...args]));

      if (cached) {
        const value = this.cache.get(key);
        if (value != null) {
          return value;
        }
      }

      const { rows } = await this.pool.query(query, args);
      this.cache.set(key, rows as unknown[]);
      return rows as unknown[];
    },
  );

  /**
   * Create a new LRU cache for postgres queries.
   *
   * @param size  number of queries to cache
   * @param ttl_s   time to live in seconds
   */
  constructor(opts: LRUQueryCacheOpts = {}) {
    const { size = 100, ttl_s = 60 } = opts;

    this.cache = new LRU({
      max: size,
      ttl: ttl_s * 1000,
    });

    this.pool = getPool();
  }

  public async query<T = Record<string, unknown>>(
    query: string,
    args: QueryCacheArgs = [],
    cached = true,
  ): Promise<T[]> {
    return (await this.queryInFlight(query, args, cached)) as T[];
  }

  public async queryOne<T = Record<string, unknown>>(
    query: string,
    args: QueryCacheArgs = [],
    cached = true,
  ): Promise<T | null> {
    const rows = await this.query<T>(query, args, cached);
    // NOTE: fallback to "null" is there to avoid serialization errors with next.js
    return rows[0] ?? null;
  }

  public clear(): void {
    this.cache.clear();
  }
}
