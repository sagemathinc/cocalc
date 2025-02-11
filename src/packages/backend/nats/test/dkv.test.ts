import { dkv as createDkv } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";

describe("create a public dkv and do basic operations", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name });
    expect(kv.get()).toEqual({});
  });

  it("adds a key to the dkv", () => {
    kv.a = 10;
    expect(kv.a).toEqual(10);
  });

  it("waits for the dkv to be longterm saved, then closing and recreates the kv and verifies that the key is there.", async () => {
    await kv.save();
    kv.close();
    kv = await createDkv({ name });
    expect(kv.a).toEqual(10);
  });

  it("closes the kv", async () => {
    kv.close();
    expect(kv.get).toThrow("closed");
  });
});

describe("opens a dkv twice at once (disabling caching) and observe sync", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the dkv twice", async () => {
    kv1 = await createDkv({ name }, { noCache: true });
    kv2 = await createDkv({ name }, { noCache: true });
    expect(kv1.get()).toEqual({});
    expect(kv2.get()).toEqual({});
    expect(kv1 === kv2).toBe(false);
  });

  it("sets a value in one and sees that it is NOT instantly set in the other", () => {
    kv1.a = 25;
    expect(kv2.a).toBe(undefined);
  });

  it("awaits save and then sees the value *eventually* appears in the other", async () => {
    await kv1.save();
    // initially not there.
    expect(kv2.a).toBe(undefined);
    await once(kv2, "change");
    expect(kv2.a).toBe(kv1.a);
  });

  it("close up", () => {
    kv1.close();
    kv2.close();
  });
});
