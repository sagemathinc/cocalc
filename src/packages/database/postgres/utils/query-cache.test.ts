/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

import { LRUQueryCache } from "./query-cache";
import type { PostgreSQL } from "../types";

describe("LRUQueryCache", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("caches results when cached=true", async () => {
    const cache = new LRUQueryCache({ size: 10, ttl_s: 60 });
    const pool = getPool();
    const querySpy = jest.spyOn(pool, "query");

    const first = await cache.query<{ value: number }>(
      "SELECT $1::INT AS value",
      [1],
    );
    const second = await cache.query<{ value: number }>(
      "SELECT $1::INT AS value",
      [1],
    );

    expect(first[0]?.value).toBe(1);
    expect(second[0]?.value).toBe(1);
    expect(querySpy).toHaveBeenCalledTimes(1);

    querySpy.mockRestore();
  });

  it("bypasses cache when cached=false", async () => {
    const cache = new LRUQueryCache({ size: 10, ttl_s: 60 });
    const pool = getPool();
    const querySpy = jest.spyOn(pool, "query");

    await cache.query("SELECT $1::INT AS value", [2], false);
    await cache.query("SELECT $1::INT AS value", [2], false);

    expect(querySpy).toHaveBeenCalledTimes(2);

    querySpy.mockRestore();
  });

  it("queryOne returns first row or null", async () => {
    const cache = new LRUQueryCache({ size: 10, ttl_s: 60 });

    const row = await cache.queryOne<{ value: number }>(
      "SELECT $1::INT AS value",
      [3],
      false,
    );
    expect(row?.value).toBe(3);

    const empty = await cache.queryOne(
      "SELECT $1::INT AS value WHERE false",
      [4],
      false,
    );
    expect(empty).toBeNull();
  });

  it("clear forces a fresh query", async () => {
    const cache = new LRUQueryCache({ size: 10, ttl_s: 60 });
    const pool = getPool();
    const querySpy = jest.spyOn(pool, "query");

    await cache.query("SELECT $1::INT AS value", [5]);
    cache.clear();
    await cache.query("SELECT $1::INT AS value", [5]);

    expect(querySpy).toHaveBeenCalledTimes(2);

    querySpy.mockRestore();
  });
});
