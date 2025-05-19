/*
A lot of GeneralKV is indirectly unit tested because many other things
build on it, and they are tested, e.g., dkv.  But it's certainly good
to test the basics here directly as well, since if something goes wrong,
it'll be easier to track down with lower level tests in place.

DEVELOPMENT:

pnpm exec jest --forceExit "general-kv.test.ts"

*/
// import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { getEnv } from "@cocalc/backend/nats/env";
import { GeneralKV } from "@cocalc/conat/sync/general-kv";
import { getMaxPayload } from "@cocalc/conat/util";

describe("create a general kv and do basic operations", () => {
  let kv, kv2, kv3, env;
  const name = `test-${Math.round(1000 * Math.random())}`;

  it("creates the kv", async () => {
    env = await getEnv();
    kv = new GeneralKV({ name, env, filter: ["foo.>"] });
    await kv.init();
    await kv.clear();
  });

  it("sets and deletes a key", async () => {
    await kv.set("foo.x", 10);
    expect(kv.getAll()).toEqual({ "foo.x": 10 });
    await kv.delete("foo.x");
    expect(kv.getAll()).toEqual({});
    await kv.set("foo.x", 10);
  });

  it("a second kv with a different filter", async () => {
    kv2 = new GeneralKV({ name, env, filter: ["bar.>"] });
    await kv2.init();
    await kv2.clear();
    expect(kv2.getAll()).toEqual({});
    await kv2.set("bar.abc", 10);
    expect(await kv2.getAll()).toEqual({ "bar.abc": 10 });
    expect(kv.getAll()).toEqual({ "foo.x": 10 });
  });

  it("the union", async () => {
    kv3 = new GeneralKV({ name, env, filter: ["bar.>", "foo.>"] });
    await kv3.init();
    expect(kv3.getAll()).toEqual({ "foo.x": 10, "bar.abc": 10 });
  });

  it("clear and closes the kv", async () => {
    await kv.clear();
    kv.close();
    await kv2.clear();
    kv2.close();
  });
});

// NOTE: with these tests, we're "dancing" with https://github.com/nats-io/nats.js/issues/246
// and might be forced to fork nats.js. Let's hope not!
describe("test that complicated keys work", () => {
  let kv, env;
  const name = `test-${Math.round(1000 * Math.random())}`;

  it("creates the kv", async () => {
    env = await getEnv();
    kv = new GeneralKV({ name, env, filter: ["foo.>"] });
    await kv.init();
  });

  it("creates complicated keys that ARE allowed", async () => {
    for (const k of [
      `foo.${base64}`,
      "foo.!@#$%^&()",
      "foo.bar.baz!.bl__-+#@ah.nat\\s",
      "foo.CoCalc-和-NATS-的结合非常棒!",
      // and a VERY long 50kb key:
      "foo." + "x".repeat(50000),
    ]) {
      await kv.set(k, "cocalc");
      expect(kv.get(k)).toEqual("cocalc");
    }
  });

  it("creates keys that are NOT allowed", async () => {
    for (const k of [
      "foo.b c",
      "foo.",
      "foo.bar.",
      "foo.b\u0000c",
      "foo.b*c",
      "foo.b>c",
    ]) {
      expect(async () => await kv.set(k, "not-allowed")).rejects.toThrow();
    }
  });

  it("clear and closes the kv", async () => {
    await kv.clear();
    kv.close();
  });
});

const base64 =
  "0123456789+/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz=";

describe("a complicated filter", () => {
  let kv, env;
  const name = `test-${Math.round(1000 * Math.random())}`;

  it("creates the kv", async () => {
    env = await getEnv();
    kv = new GeneralKV({ name, env, filter: [`${base64}.>`] });
    await kv.init();
  });
  it("clear and closes the kv", async () => {
    await kv.clear();
    kv.close();
  });
});

describe("test using the binary value type", () => {
  let kv, env;
  const name = `test-${Math.round(1000 * Math.random())}`;

  it("creates the kv", async () => {
    env = await getEnv();
    kv = new GeneralKV({ name, env, filter: ["foo.>"], valueType: "binary" });
    await kv.init();
  });

  it("set and get a binary value", async () => {
    const value = Buffer.from([0, 0, 3, 8, 9, 5, 0, 7, 7]);
    await kv.set("foo.b", value);
    expect(kv.get("foo.b")).toEqual(value);
    expect(kv.get("foo.b").length).toEqual(9);
  });

  it("sets and gets a large binary value that requires chunking", async () => {
    const m = await getMaxPayload();
    const value = Buffer.from("x".repeat(1.5 * m));
    value[0] = 7;
    await kv.set("foo.big", value);
    expect(kv.get("foo.big").length).toEqual(value.length);
  });

  it("clear and closes the kv", async () => {
    await kv.clear();
    kv.close();
  });
});

describe("test using a range of useful functions: length, has, time, headers, etc.", () => {
  let kv, env;
  const name = `test-${Math.round(1000 * Math.random())}`;

  it("creates the kv", async () => {
    env = await getEnv();
    kv = new GeneralKV({ name, env, filter: ["foo.>"] });
    await kv.init();
  });

  it("sets a value and observe length matches", async () => {
    expect(kv.length).toBe(0);
    await kv.set("foo.x", 10);
    expect(kv.length).toBe(1);
  });

  it("sets a value and observe time is reasonable", async () => {
    await kv.set("foo.time", 10);
    while (kv.time("foo.time") == null) {
      await delay(10);
    }
    expect(Math.abs(kv.time("foo.time").valueOf() - Date.now())).toBeLessThan(
      10000,
    );
  });

  it("check has works", async () => {
    expect(await kv.has("foo.has")).toBe(false);
    await kv.set("foo.has", "it");
    expect(await kv.has("foo.has")).toBe(true);
    await kv.delete("foo.has");
    expect(await kv.has("foo.has")).toBe(false);
  });

  it("verifying key is valid given the filter", async () => {
    expect(kv.isValidKey("foo.x")).toBe(true);
    expect(kv.isValidKey("bar.x")).toBe(false);
  });

  it("expire keys using ageMs", async () => {
    await kv.set("foo.old", 10);
    await delay(100);
    await kv.set("foo.new", 20);
    await kv.expire({ ageMs: 200 });
    expect(kv.has("foo.old")).toBe(true);
    await kv.expire({ ageMs: 50 });
    expect(kv.has("foo.old")).toBe(false);
    expect(kv.has("foo.new")).toBe(true);
  });

  it("expire keys using cutoff", async () => {
    await kv.set("foo.old0", 10);
    await delay(50);
    const cutoff = new Date();
    await delay(50);
    await kv.set("foo.new0", 20);
    await kv.expire({ cutoff });
    expect(kv.has("foo.old0")).toBe(false);
    expect(kv.has("foo.new0")).toBe(true);
  });

  it("sets and gets a header", async () => {
    await kv.set("foo.head", 10, { headers: { CoCalc: "NATS" } });
    expect(kv.get("foo.head")).toBe(10);
    while (kv.headers("foo.head") == null) {
      await delay(10);
    }
    expect(kv.headers("foo.head").CoCalc).toBe("NATS");
  });

  it("sanity check on stats", async () => {
    const stats = kv.stats();
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.bytes).toBeGreaterThan(0);
  });

  it("clear and closes the kv", async () => {
    await kv.clear();
    kv.close();
  });
});
