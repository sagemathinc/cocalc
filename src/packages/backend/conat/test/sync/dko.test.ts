/*
Testing basic ops with dko = distributed key:object store with SPARSE updates.

DEVELOPMENT:

pnpm test ./dko.test.ts

*/

import { dko as createDko } from "@cocalc/backend/conat/sync";
import {
  before,
  after,
  connect,
  client,
} from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("create a public dko and do a basic operation", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dko", async () => {
    kv = await createDko({ name });
    expect(kv.getAll()).toEqual({});
  });

  it("tries to add a non-object and fails", () => {
    expect(() => {
      kv.a = 10;
    }).toThrow("must be objects");
  });

  it("adds a key to the dko", () => {
    kv.a = { a: 5, b: 7 };
    expect(kv.a).toEqual({ a: 5, b: 7 });
  });

  it("waits for the dko to be saved, then closing and recreates the kv and verifies that the key is there.", async () => {
    await kv.save();
    kv.close();
    kv = await createDko({ name });
    expect(kv.a).toEqual({ a: 5, b: 7 });
  });

  it("verifies sparseness of underlying storage", () => {
    expect(Object.keys(kv.getAll()).length).toBe(1);
    // 3 = object structure (1) + values (2)
    expect(Object.keys(kv.dkv.getAll()).length).toBe(3);
  });

  it("clears and closes the kv", async () => {
    kv.clear();
    await kv.close();
    expect(kv.getAll).toThrow("closed");
  });
});

describe("create dko and check more complicated keys", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dko", async () => {
    kv = await createDko({ name });
    expect(kv.getAll()).toEqual({});
    const key = "a!@#$%^&*|()lkasdjfxxxxxxxxxx";
    kv.set(key, { [key]: "bar" });
    expect(kv.get(key)).toEqual({ [key]: "bar" });
  });

  it("clears and closes the kv", async () => {
    kv.clear();
    await kv.close();
  });
});

describe("test a large value that requires chunking", () => {
  let kv;
  const name = `test-${Math.random()}`;

  let maxPayload = 0;

  it("sanity check on the max payload", async () => {
    const client = connect();
    await wait({ until: () => client.info != null });
    maxPayload = client.info?.max_payload ?? 0;
    expect(maxPayload).toBeGreaterThan(500000);
  });

  it("creates the dko", async () => {
    kv = await createDko({ name });
    expect(kv.getAll()).toEqual({});

    const big = { foo: "b".repeat(maxPayload * 1.3) };
    kv.set("big", big);
    expect(kv.get("big")).toEqual(big);
  });

  it("clears and closes the kv", async () => {
    kv.clear();
    await kv.close();
  });
});

describe("test keys that start with a bracket, weird keys, valid JSON, etc", () => {
  let kv, kv2;
  let client2;
  const BAD_KEYS = [
    "[foo]",
    "[P] [W}\\ test]",
    "normal",
    JSON.stringify(["foo", "bar"]),
  ];
  it("creates a dko", async () => {
    client2 = connect();
    const name = "[!nuts$##&^$$#!\\blah]";
    kv = await client.sync.dko({ name });
    kv2 = await client2.sync.dko({ name });
    for (const key of BAD_KEYS) {
      kv.set(key, { cocalc: "conat" });
      expect(kv.has(key)).toBe(true);
      expect(kv.get(key)).toEqual({ cocalc: "conat" });
      await kv.save();
      await wait({ until: () => kv2.has(key) });
      expect(kv2.get(key)).toEqual({ cocalc: "conat" });
    }
  });
});

describe("test automatic migration of old format dko", () => {
  it("create a dko and then manually make it have the old format", async () => {
    const kv = await client.sync.dko({ name: "old-format" });
    kv.set("x", { foo: "bar" });
    expect(kv.dkv.keys()).toEqual(['["x"]', '["x","foo"]']);

    // we used to use 'x' as one of the keys
    kv.dkv.set("x", kv.dkv.get('["x"]'));
    kv.dkv.delete('["x"]');
    await kv.save();
    expect(kv.dkv.keys()).toEqual(['["x","foo"]', "x"]);
    kv.close();
  });

  it("open it and observe it correctly and automatically converts", async () => {
    const kv = await client.sync.dko({ name: "old-format" });
    // note: for now the old key is left for backward compat with running instances;
    // this will change in a month or so.
    expect(kv.getAll()).toEqual({ x: { foo: "bar" } });
    expect(kv.dkv.keys()).toEqual(['["x","foo"]', "x", '["x"]']);
    expect(kv.get("x")).toEqual({ foo: "bar" });
    kv.close();
  });
});


afterAll(after);
