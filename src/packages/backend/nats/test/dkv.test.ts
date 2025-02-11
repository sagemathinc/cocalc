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

describe("opens a dkv twice and verifies it was cached", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the dkv twice", async () => {
    kv1 = await createDkv({ name });
    kv2 = await createDkv({ name });
    expect(kv1.get()).toEqual({});
    expect(kv1 === kv2).toBe(true);
  });
  it("closes", async () => {
    kv1.close();
    expect(kv2.get).toThrow("closed");
  });
});

describe("opens a dkv twice at once and observe sync", () => {
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

describe("check server assigned times", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("create a kv", async () => {
    kv = await createDkv({ name });
    expect(kv.get()).toEqual({});
    expect(kv.time()).toEqual({});
  });

  it("set a key, then get the time and confirm it is reasonable", async () => {
    kv.a = { b: 7 };
    // not serve assigned yet
    expect(kv.time("a")).toEqual(undefined);
    await kv.save();
    // still not server assigned
    expect(kv.time("a")).toEqual(undefined);
    await once(kv, "change");
    // now we must have it.
    // sanity check: within a second
    expect(kv.time("a").getTime()).toBeCloseTo(Date.now(), -3);
    // all the times
    expect(Object.keys(kv.time()).length).toBe(1);
  });

  it("setting again with a *different* value changes the time", async () => {
    kv.a = { b: 8 };
    const t0 = kv.time("a");
    await once(kv, "change");
    expect(kv.time("a").getTime()).toBeCloseTo(Date.now(), -3);
    expect(t0).not.toEqual(kv.time("a"));
  });

  it("close", () => {
    kv.close();
  });
});

describe("test deleting and clearing a dkv", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  const reset = () => {
    kv1.clear();
    kv2.clear();
  };

  it("creates the dkv twice without caching so can make sure sync works", async () => {
    kv1 = await createDkv({ name }, { noCache: true });
    kv2 = await createDkv({ name }, { noCache: true });
    expect(kv1.get()).toEqual({});
    expect(kv2.get()).toEqual({});
    expect(kv1 === kv2).toBe(false);
  });

  it("adds an entry, deletes it and confirms", async () => {
    kv1.foo = "bar";
    expect(kv1.has("foo")).toBe(true);
    expect(kv2.has("foo")).toBe(false);
    await once(kv2, "change");
    expect(kv2.foo).toBe(kv1.foo);
    expect(kv2.has("foo")).toBe(true);
    delete kv1.foo;
    await once(kv2, "change");
    expect(kv2.foo).toBe(undefined);
    expect(kv2.has("foo")).toBe(false);
  });

  it("adds an entry, clears it and confirms", async () => {
    reset();

    kv1.foo = "bar";
    await once(kv2, "change");
    expect(kv2.foo).toBe(kv1.foo);
    kv2.clear();
    expect(kv2.has("foo")).toBe(false);
    await once(kv1, "change");
    expect(kv1.has("foo")).toBe(false);
  });

  it("adds an entry, syncs, adds another local entry (not sync'd), clears in sync and confirms NOT everything was cleared", async () => {
    reset();
    kv1.foo = Math.random();
    await kv1.save();
    if (kv2.foo != kv1.foo) {
      await once(kv2, "change");
    }
    expect(kv2.foo).toBe(kv1.foo);
    kv1.xxx = "yyy";
    expect(kv2.xxx).toBe(undefined);
    // this ONLY clears foo, not xxx
    kv2.clear();
    await once(kv1, "change");
    expect(kv1.has("xxx")).toBe(true);
  });

  it("adds an entry, syncs, adds another local entry (not sync'd), clears in first one, and confirms everything was cleared", async () => {
    reset();

    kv1.foo = Math.random();
    await kv1.save();
    if (kv2.foo != kv1.foo) {
      await once(kv2, "change");
    }
    kv1.xxx = "yyy";
    expect(kv2.xxx).toBe(undefined);
    // this ONLY clears foo, not xxx
    kv1.clear();
    expect(kv1.has("xxx")).toBe(false);
  });
});

describe("set several items, confirm exist, save, and confirm they are still there", () => {
  const name = `test-${Math.random()}`;
  const count = 10;
  it(`adds ${count} entries`, async () => {
    const kv = await createDkv({ name });
    expect(kv.get()).toEqual({});
    for (let i = 0; i < count; i++) {
      kv[`${i}`] = i;
    }
    console.log(kv.get());
    expect(Object.keys(kv.get()).length).toEqual(count);
    await kv.save();
    console.log(kv.get());
    expect(Object.keys(kv.get()).length).toEqual(count);
  });
});

// import { delay } from "awaiting";

// describe("do a large insert and clear stress test", () => {
//   const name = `test-${Math.random()}`;
//   const count = 10;
//   it(`adds ${count} entries, saves, clears, and confirms empty`, async () => {
//     const kv = await createDkv({ name });
//     expect(kv.get()).toEqual({});
//     for (let i = 0; i < count; i++) {
//       kv[`${i}`] = i;
//     }
//     console.log(kv.get());
//     expect(Object.keys(kv.get()).length).toEqual(count);
//     await kv.save();
//     console.log(kv.get());
//     expect(Object.keys(kv.get()).length).toEqual(count);
//     kv.clear();
//     expect(kv.get()).toEqual({});
//     await kv.save();
//     expect(kv.get()).toEqual({});
//   });
// });
