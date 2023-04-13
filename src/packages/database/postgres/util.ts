/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";
import LRU from "lru-cache";
import { Pool } from "pg";

import { sha1 } from "@cocalc/backend/misc_node";
import getPool from "@cocalc/database/pool";
import { is_array } from "@cocalc/util/misc";

/* Some random little utils */

// Convert timestamp fields as returned from postgresql queries
// into ms since the epoch, as a number.
export function toEpoch(rows: object | object[], fields: string[]): void {
  if (!is_array(rows)) {
    rows = [rows];
  }
  // @ts-ignore
  for (const row of rows) {
    for (const field of fields) {
      if (row[field]) {
        row[field] = new Date(row[field]).valueOf();
      }
    }
  }
}

interface LRUQueryCacheOpts {
  size?: number;
  ttl_s?: number;
}

/**
 * A simple LRU cache for postgres queries. This is better than getPool("some string"),
 * because you're more in control, sha1 key sums to avoid sticking large keys in the cache,
 * and you can clear the cache any time if you want.
 */
export class LRUQueryCache {
  private cache: LRU<string, any>;
  private pool: Pool;

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

  public query = reuseInFlight(
    async <T>(
      query: string,
      args: (string | number | Date)[] = []
    ): Promise<T[]> => {
      const key = sha1(JSON.stringify([query, ...args]));
      let value = this.cache.get(key);
      if (value != null) return value;

      const { rows } = await this.pool.query(query, args);
      this.cache.set(key, rows);
      return rows;
    }
  );

  public async queryOne<T = any>(
    query: string,
    args: (string | number | Date)[] = []
  ): Promise<T | null> {
    const rows = await this.query(query, args);
    // NOTE: fallback to "null" is there to avoid serialization errors with next.js
    return rows[0] ?? null;
  }

  public clear(): void {
    this.cache.clear();
  }
}
