/*
Testing basic ops with dko = distributed key:object store with SPARSE updates.

DEVELOPMENT:

pnpm exec jest --forceExit --detectOpenHandles "dko.test.ts"

*/

import { dko as createDko } from "@cocalc/backend/nats/sync";
import { getMaxPayload } from "@cocalc/nats/util";
import { getConnection } from "@cocalc/nats/client";

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

  it("creates the dko", async () => {
    kv = await createDko({ name });
    expect(kv.getAll()).toEqual({});

    const n = getMaxPayload(await getConnection());
    const big = { foo: "b".repeat(n * 1.3) };
    kv.set("big", big);
    expect(kv.get("big")).toEqual(big);
  });

  it("clears and closes the kv", async () => {
    kv.clear();
    await kv.close();
  });
});

