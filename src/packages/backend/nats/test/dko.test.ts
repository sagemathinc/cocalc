/*
Testing basic ops with kv

DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "dko.test.ts"

*/

import { dko as createDko } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";

describe("create a public kv and do basic operations", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the kv", async () => {
    kv = await createDko({ name });
    expect(kv.get()).toEqual({});
  });

  it("adds a key to the kv", () => {
    kv.a = { x: 10 };
    expect(kv.a).toEqual({ x: 10 });
  });

  it("complains if value is not an object", () => {
    expect(() => {
      kv.x = 5;
    }).toThrow("object");
  });

  it("waits for the kv to be longterm saved, then closing and recreates the kv and verifies that the key is there.", async () => {
    await kv.save();
    kv.close();
    kv = await createDko({ name });
    expect(kv.a).toEqual({ x: 10 });
  });

  it("closes the kv", async () => {
    kv.close();
    expect(kv.get).toThrow("closed");
  });
});

describe("opens a kv twice and verifies the cached works and is reference counted", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the same kv twice", async () => {
    kv1 = await createDko({ name });
    kv2 = await createDko({ name });
    expect(kv1.get()).toEqual({});
    expect(kv1 === kv2).toBe(true);
  });

  it("closes kv1 (one reference)", async () => {
    kv1.close();
    expect(kv2.get).not.toThrow();
  });

  it("closes kv2 (another reference)", async () => {
    kv2.close();
    // really closed!
    expect(kv2.get).toThrow("closed");
  });

  it("create and see it is new now", async () => {
    kv1 = await createDko({ name });
    expect(kv1 === kv2).toBe(false);
  });
});

describe("opens a kv twice at once and observe sync", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the kv twice", async () => {
    kv1 = await createDko({ name, noCache: true });
    kv2 = await createDko({ name, noCache: true });
    expect(kv1.get()).toEqual({});
    expect(kv2.get()).toEqual({});
    expect(kv1 === kv2).toBe(false);
  });

  it("sets a value in one and sees that it is NOT instantly set in the other", () => {
    kv1.a = { x: 25 };
    expect(kv2.a).toBe(undefined);
  });

  it("awaits save and then sees the value *eventually* appears in the other", async () => {
    kv1.save();
    // initially not there.
    while (kv2.a?.x === undefined) {
      await once(kv2, "change");
    }
    expect(kv2.a).toEqual(kv1.a);
  });

  it("close up", () => {
    kv1.close();
    kv2.close();
  });
});

