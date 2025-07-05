/*
DEVELOPMENT:

pnpm test ./dkv-basics.test.ts

*/
import { DKV } from "@cocalc/conat/sync/dkv";
import { connect, before, after } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("create a general kv and do basic operations", () => {
  const name = "test";
  let client, kv;

  it("creates the kv", async () => {
    client = connect();
    kv = new DKV({ name, client });
    await kv.init();
  });

  it("sets and deletes a key", async () => {
    expect(kv.has("foo")).toBe(false);
    kv.set("foo", 10);
    expect(kv.has("foo")).toBe(true);
    expect(kv.getAll()).toEqual({ foo: 10 });
    kv.delete("foo");
    expect(kv.getAll()).toEqual({});
    kv.set("co", "nat");
    await kv.save();
  });

  let client2, kv2;
  it("view the kv from a second client via sync, set a date value and observe it syncs", async () => {
    client2 = connect();
    kv2 = new DKV({ name, client: client2 });
    await kv2.init();
    expect(kv2.getAll()).toEqual({ co: "nat" });

    const date = new Date("1974");
    kv2.set("x", date);
    // replication is not instant
    expect(kv.get("x")).toBe(undefined);
    await kv2.save();
    await wait({ until: () => kv.get("x") });
    expect(kv.getAll()).toEqual({ x: date, co: "nat" });
  });

  it("checks that clear works", async () => {
    kv.clear();
    await wait({ until: () => kv.length == 0 });
    expect(kv.length).toBe(0);
    await wait({ until: () => kv2.length == 0 });
  });

  it("checks that time works", async () => {
    const key = "x".repeat(1000);
    kv.set(key, "big key");
    await kv.save();
    expect(Math.abs(Date.now() - kv.time(key))).toBeLessThan(300);
    expect(kv.time()).toEqual({ [key]: kv.time(key) });
    expect(kv2.time()).toEqual({ [key]: kv2.time(key) });
  });

  it("check headers work", async () => {
    kv.set("big", "headers", { headers: { silicon: "valley", x: { y: "z" } } });
    // this uses local state
    expect(kv.headers("big")).toEqual({ silicon: "valley", x: { y: "z" } });
    await kv.save();
    // this uses what got echoed back from server
    expect(kv.headers("big")).toEqual({ silicon: "valley", x: { y: "z" } });
    expect(kv2.headers("big")).toEqual({ silicon: "valley", x: { y: "z" } });
  });

  it("checks hasUnsavedChanges works", async () => {
    expect(kv.hasUnsavedChanges()).toBe(false);
    kv.set("unsaved", ["changes"]);
    expect(kv.hasUnsavedChanges()).toBe(true);
    expect(kv.unsavedChanges()).toEqual(["unsaved"]);
    expect(kv2.hasUnsavedChanges()).toBe(false);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  it("checks stats works", () => {
    const { bytes, count } = kv.stats();
    expect(bytes).not.toBeNaN();
    expect(bytes).toBeGreaterThan(0);
    expect(count).not.toBeNaN();
    expect(count).toBeGreaterThan(0);
  });

  it("checks seq is ", async () => {
    kv.set("x", "11");
    await kv.save();
    const seq = kv.seq("x");
    expect(seq).toBeGreaterThan(0);
    kv.set("x", 15);
    await kv.save();
    expect(kv.seq("x") - seq).toBe(1);
  });

  it("clean up", async () => {
    kv.close();
    client.close();
  });
});

afterAll(after);
