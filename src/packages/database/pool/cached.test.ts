/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

type PoolLike = {
  query: jest.Mock;
};

type CachedModule = {
  default: (options?: any) => any;
};

const loadCached = async () => {
  jest.resetModules();
  const pool: PoolLike = {
    query: jest.fn(),
  };
  const getPool = jest.fn(() => pool);

  jest.doMock("./pool", () => ({
    __esModule: true,
    default: getPool,
  }));

  jest.doMock("@cocalc/backend/logger", () => {
    const makeLogger = () => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    });
    const getLogger = () => makeLogger();
    return {
      __esModule: true,
      default: getLogger,
      getLogger,
    };
  });

  const cachedModule = (await import("./cached")) as CachedModule;
  return { getCachedPool: cachedModule.default, getPool, pool };
};

describe("getCachedPool", () => {
  it("forwards ensureExists to getPool and caches hits", async () => {
    const { getCachedPool, getPool, pool } = await loadCached();
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const cached = getCachedPool({ cacheTime: "short", ensureExists: false });
    await cached.query("SELECT 1");

    expect(getPool).toHaveBeenCalledWith({ ensureExists: false });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("reuses cached results for identical queries", async () => {
    const { getCachedPool, pool } = await loadCached();
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const cached = getCachedPool("short");
    await cached.query("SELECT 1");
    await cached.query("SELECT 1");

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("does not cache empty results", async () => {
    const { getCachedPool, pool } = await loadCached();
    pool.query.mockResolvedValue({ rows: [] });

    const cached = getCachedPool("short");
    await cached.query("SELECT 1");
    await cached.query("SELECT 1");

    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("throws on invalid cache names", async () => {
    const { getCachedPool } = await loadCached();
    const cached = getCachedPool("invalid" as any);

    await expect(cached.query("SELECT 1")).rejects.toThrow(
      'invalid cache "invalid"',
    );
  });

  it("returns the underlying pool when cache is disabled", async () => {
    const { getCachedPool, getPool, pool } = await loadCached();
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const cached = getCachedPool({ cacheTime: "short", ensureExists: false });
    expect(cached).not.toBe(pool);
    await cached.query("SELECT 1");

    const direct = getCachedPool();
    expect(direct).toBe(pool);
    expect(getPool).toHaveBeenLastCalledWith({ ensureExists: true });
  });
});
