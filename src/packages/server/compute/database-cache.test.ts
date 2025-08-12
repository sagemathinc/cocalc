import { createDatabaseCachedResource, createTTLCache } from "./database-cache";
import { delay } from "awaiting";
import { before, after } from "@cocalc/server/test";

beforeAll(before, 15000);
afterAll(after);

// keep short so that unit testing is fast... but long enough
// that things don't break on github actions.
const TTL_MS = 300;

describe("test a database backed TTLCache cache", () => {
  let cache;
  const ttl = TTL_MS;
  it("creates a ttl cache", () => {
    cache = createTTLCache({ ttl, cloud: `cloud-${Math.random()}` });
  });

  it("standard use of the ttl cache", async () => {
    expect(await cache.has("foo")).toBe(false);
    await cache.set("foo", "bar");
    expect(await cache.has("foo")).toBe(true);
    expect(await cache.get("foo")).toBe("bar");
    await delay(ttl - 150);
    expect(await cache.has("foo")).toBe(true);
    await delay(200);
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

describe("test database backed TTLCache cache with prefix", () => {
  let cache_prefix, cache_noprefix, cache_noprefix2;
  const prefix = "server";
  const cloud = `cloud-${Math.random()}`;
  const ttl = TTL_MS;
  it("creates ttl caches", () => {
    cache_noprefix = createTTLCache({ ttl, cloud });
    cache_noprefix2 = createTTLCache({ ttl, cloud });
    cache_prefix = createTTLCache({
      ttl,
      cloud,
      prefix,
    });
  });

  it("saves a value and gets it with both noprefix cache (should be same!)", async () => {
    await cache_noprefix.set("a", 10);
    expect(await cache_noprefix.get("a")).toBe(10);
    expect(await cache_noprefix2.get("a")).toBe(10);
    expect(await cache_prefix.has("a")).toBe(false);
  });

  it("it is not there for the prefix cache, but save in prefix cache works and is different namespace", async () => {
    expect(await cache_prefix.has("a")).toBe(false);
    await cache_prefix.set("a", 5);
    expect(await cache_noprefix.get("a")).toBe(10);
    expect(await cache_prefix.get("a")).toBe(5);
  });
});

describe("test a DatabaseCachedResource cache", () => {
  let cache;
  const ttl = TTL_MS;
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

  it("explicitly expires cache and sees that the value we get is different", async () => {
    const { n } = await cache.get();
    await cache.expire();
    await delay(100);
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
