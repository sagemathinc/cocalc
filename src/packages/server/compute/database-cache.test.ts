import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { createDatabaseCachedResource, createTTLCache } from "./database-cache";
import { delay } from "awaiting";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a database backed TTLCache cache and test it", () => {
  let cache;
  const ttl = 300;
  it("creates a ttl cache", () => {
    cache = createTTLCache({ ttl, cloud: `cloud-${Math.random()}` });
  });

  it("standard use of the ttl cache", async () => {
    expect(await cache.has("foo")).toBe(false);
    await cache.set("foo", "bar");
    expect(await cache.has("foo")).toBe(true);
    expect(await cache.get("foo")).toBe("bar");
    await delay(ttl - 50);
    expect(await cache.has("foo")).toBe(true);
    await delay(100);
    expect(await cache.has("foo")).toBe(false);
    await cache.set("foo2", "bar2");
    expect(await cache.get("foo2")).toBe("bar2");
    await cache.delete("foo2");
    expect(await cache.has("foo2")).toBe(false);
  });

  it("keys and values do not have to be strings", async () => {
    const key = { foo: "bar", stuff: [1, 2] };
    const value = { a: [4, 5], b: { x: 1 } };
    expect(await cache.has(key)).toBe(false);
    await cache.set(key, value);
    expect(await cache.get(key)).toEqual(value);
    expect(await cache.get(key)).toEqual({ b: { x: 1 }, a: [4, 5] });
    // and key is stable!
    expect(await cache.has({ stuff: [1, 2], foo: "bar" })).toBe(true);
    expect(await cache.delete({ stuff: [1, 2], foo: "bar" }));
    expect(await cache.has(key)).toBe(false);
  });
});

describe("create a DatabaseCachedResource cache and test it", () => {
  let cache;
  const ttl = 300; // keep short so that unit testing is fast...
  let broken = false;

  it("creates a DatabaseCachedResource cache", () => {
    cache = createDatabaseCachedResource<{ n: number }>({
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

  it("force not using cache", async () => {
    const { n } = await cache.get();
    const second = await cache.get();
    expect(n).toBe(second.n);
    const third = await cache.get({ noCache: true });
    expect(n).not.toBe(third.n);
  });
});
