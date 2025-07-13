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
    kv.close();
    kv2.close();
  });
});

describe("illustrate that https://github.com/sagemathinc/cocalc/issues/8386 is not truly fixed", () => {
  it("creates a dko", async () => {
    const kv = await client.sync.dko({ name: "issue-8386" });
    const key = JSON.stringify(["key", "field"]);
    kv.set(key, { foo: "bar" });
    expect(kv.fromPath(key)).toEqual({ key: "key", field: "field" });
    expect(kv.get(key)).toEqual({ foo: "bar" });

    // here's the bug -- basically if you have a key that is a valid JSON array of
    // length two (and only then), you get an extra spurious key.  This might never
    // be a problem in practice though, since the key you want is also there.
    expect(kv.getAll()).toEqual({
      key: { field: ["foo"] },
      '["key","field"]': { foo: "bar" },
    });
  });
});

afterAll(after);
