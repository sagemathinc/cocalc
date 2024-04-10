import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { createDatabaseCache } from "./database-cache";
import { delay } from "awaiting";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a cache and test it", () => {
  let cache;
  const ttl = 300; // keep short so that unit testing is fast...
  let broken = false;

  it("creates a cache", () => {
    cache = createDatabaseCache<{ n: number }>({
      cloud: "test",
      key: `foo-${Math.random()}`,
      ttl,
      fetchData: async () => {
        if (broken) {
          throw Error("I am broken!");
        }
        return { n: Math.random() };
      },
    });
  });

  it("broken and cache empty throws an error", async () => {
    broken = true;
    await expect(cache.get()).rejects.toThrow("I am broken!");
    broken = false;
  });

  it("gets a value from the cache twice and it is consistent", async () => {
    const { n } = await cache.get();
    const second = await cache.get();
    expect(n).toBe(second.n);
  });

  it("expires cache and sees that the value we get is different", async () => {
    const { n } = await cache.get();
    await cache.expire();
    const second = await cache.get();
    expect(n).not.toBe(second.n);
  });

  it("wait and see the cache not expire, then expire", async () => {
    const { n } = await cache.get();
    await delay(ttl - 50);
    const second = await cache.get();
    expect(n).toBe(second.n);
    await delay(100);
    const third = await cache.get();
    expect(n).not.toBe(third.n);
  });

  it("break the cache and see that it returns the old expired value", async () => {
    const { n } = await cache.get();
    await delay(ttl + 50);
    broken = true;
    const second = await cache.get();
    expect(n).toBe(second.n);
    // and works again:
    broken = false;
    const third = await cache.get();
    expect(n).not.toBe(third.n);
  });
});
