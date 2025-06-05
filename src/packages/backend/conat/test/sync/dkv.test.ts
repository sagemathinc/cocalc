/*
Testing basic ops with dkv

DEVELOPMENT:

pnpm test ./dkv.test.ts

*/

import { dkv as createDkv } from "@cocalc/backend/conat/sync";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("create a public dkv and do basic operations", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name, noCache: true });
    expect(kv.getAll()).toEqual({});
  });

  it("adds a key to the dkv", () => {
    kv.a = 10;
    expect(kv.a).toEqual(10);
  });

  it("waits for the dkv to be longterm saved, then closing and recreates the kv and verifies that the key is there.", async () => {
    await kv.save();
    kv.close();
    kv = await createDkv({ name, noCache: true });
    expect(kv.a).toEqual(10);
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
    expect(() => kv.getAll()).toThrow("closed");
  });
});

describe("opens a dkv twice and verifies the cache works and is reference counted", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the same dkv twice", async () => {
    kv1 = await createDkv({ name });
    kv2 = await createDkv({ name });
    expect(kv1.getAll()).toEqual({});
    expect(kv1 === kv2).toBe(true);
  });

  it("closes kv1 (one reference)", async () => {
    await kv1.close();
    expect(kv2.getAll).not.toThrow();
  });

  it("closes kv2 (another reference)", async () => {
    await kv2.close();
    await delay(1);
    // really closed!
    expect(() => kv2.getAll()).toThrow("closed");
  });

  it("create and see it is new now", async () => {
    kv1 = await createDkv({ name });
    expect(kv1 === kv2).toBe(false);
  });
});

describe("opens a dkv twice at once and observe sync", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.random()}`;

  it("creates the dkv twice", async () => {
    kv1 = await createDkv({ name, noCache: true, noAutosave: true });
    kv2 = await createDkv({ name, noCache: true, noAutosave: true });
    expect(kv1.getAll()).toEqual({});
    expect(kv2.getAll()).toEqual({});
    expect(kv1 === kv2).toBe(false);
  });

  it("sets a value in one and sees that it is NOT instantly set in the other", () => {
    kv1.a = 25;
    expect(kv2.a).toBe(undefined);
  });

  it("awaits save and then sees the value *eventually* appears in the other", async () => {
    // not initially not there.
    expect(kv2.a).toBe(undefined);
    await kv1.save();
    if (kv2.a === undefined) {
      await once(kv2, "change");
    }
    expect(kv2.a).toBe(kv1.a);
  });

  it("close up", async () => {
    await kv1.clear();
    await kv1.close();
    await kv2.clear();
    await kv2.close();
  });
});

describe("check server assigned times", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("create a kv", async () => {
    kv = await createDkv({ name });
    expect(kv.getAll()).toEqual({});
    expect(kv.time()).toEqual({});
  });

  it("set a key, then get the time and confirm it is reasonable", async () => {
    kv.a = { b: 7 };
    // not serve assigned yet
    expect(kv.time("a")).toEqual(undefined);
    kv.save();
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

  it("close", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe("test deleting and clearing a dkv", () => {
  let kv1;
  let kv2;

  const reset = async () => {
    const name = `test-${Math.random()}`;
    kv1 = await createDkv({ name, noCache: true });
    kv2 = await createDkv({ name, noCache: true });
  };

  it("creates the dkv twice without caching so can make sure sync works", async () => {
    await reset();
    expect(kv1.getAll()).toEqual({});
    expect(kv2.getAll()).toEqual({});
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
    await reset();

    kv1.foo10 = "bar";
    await once(kv2, "change");
    expect(kv2.foo10).toBe(kv1.foo10);
    kv2.clear();
    expect(kv2.has("foo10")).toBe(false);
    await once(kv1, "change");
    while (kv1.has("foo10")) {
      await once(kv1, "change");
    }
    expect(kv1.has("foo10")).toBe(false);
  });

  it("adds an entry, syncs, adds another local entry (not sync'd), clears in sync and confirms NOT everything was cleared", async () => {
    await reset();
    kv1["foo"] = Math.random();
    await kv1.save();
    if (kv2["foo"] != kv1["foo"]) {
      await once(kv2, "change");
    }
    expect(kv2["foo"]).toBe(kv1["foo"]);
    kv1["bar"] = "yyy";
    expect(kv2["bar"]).toBe(undefined);
    // this ONLY clears 'foo', not 'bar'
    kv2.clear();
    await once(kv1, "change");
    expect(kv1.has("bar")).toBe(true);
  });

  it("adds an entry, syncs, adds another local entry (not sync'd), clears in first one, and confirms everything was cleared", async () => {
    await reset();

    const key = Math.random();
    kv1[key] = Math.random();
    await kv1.save();
    if (kv2[key] != kv1[key]) {
      await once(kv2, "change");
    }
    const key2 = Math.random();
    kv1[key2] = "yyy";
    expect(kv2[key2]).toBe(undefined);
    // this ONLY clears foo, not xxx
    kv1.clear();
    expect(kv1.has(key2)).toBe(false);
  });

  it("close", async () => {
    await kv1.clear();
    await kv1.close();
    await kv2.clear();
    await kv2.close();
  });
});

describe("set several items, confirm write worked, save, and confirm they are still there after save", () => {
  const name = `test-${Math.random()}`;
  const count = 50;
  // the time thresholds should be "trivial"
  it(`adds ${count} entries`, async () => {
    const kv = await createDkv({ name });
    expect(kv.getAll()).toEqual({});
    const obj: any = {};
    const t0 = Date.now();
    for (let i = 0; i < count; i++) {
      obj[`${i}`] = i;
      kv.set(`${i}`, i);
    }
    expect(Date.now() - t0).toBeLessThan(50);
    expect(Object.keys(kv.getAll()).length).toEqual(count);
    expect(kv.getAll()).toEqual(obj);
    await kv.save();
    expect(Date.now() - t0).toBeLessThan(2000);
    await wait({ until: () => Object.keys(kv.getAll()).length == count });
    expect(Object.keys(kv.getAll()).length).toEqual(count);
    //     // the local state maps should also get cleared quickly,
    //     // but there is no event for this, so we loop:
    //  @ts-ignore: saved is private
    while (Object.keys(kv.local).length > 0) {
      await delay(10);
    }
    // @ts-ignore: local is private
    expect(kv.local).toEqual({});
    // @ts-ignore: saved is private
    expect(kv.saved).toEqual({});

    await kv.clear();
    await kv.close();
  });
});

describe("do an insert and clear test", () => {
  const name = `test-${Math.random()}`;
  const count = 25;
  it(`adds ${count} entries, saves, clears, and confirms empty`, async () => {
    const kv = await createDkv({ name });
    expect(kv.getAll()).toEqual({});
    for (let i = 0; i < count; i++) {
      kv[`${i}`] = i;
    }
    expect(Object.keys(kv.getAll()).length).toEqual(count);
    await kv.save();
    await wait({ until: () => Object.keys(kv.getAll()).length == count });
    expect(Object.keys(kv.getAll()).length).toEqual(count);
    kv.clear();
    expect(kv.getAll()).toEqual({});
    await kv.save();
    await wait({ until: () => Object.keys(kv.getAll()).length == 0 });
    expect(kv.getAll()).toEqual({});
  });
});

describe("create many distinct clients at once, write to all of them, and see that that results are merged", () => {
  const name = `test-${Math.random()}`;
  const count = 4;
  const clients: any[] = [];

  it(`creates the ${count} clients`, async () => {
    for (let i = 0; i < count; i++) {
      clients[i] = await createDkv({ name, noCache: true });
    }
  });

  // what the combination should be
  let combined: any = {};
  it("writes a separate key/value for each client", () => {
    for (let i = 0; i < count; i++) {
      clients[i].set(`${i}`, i);
      combined[`${i}`] = i;
      expect(clients[i].get(`${i}`)).toEqual(i);
    }
  });

  it("saves and checks that everybody has the combined values", async () => {
    for (const kv of clients) {
      await kv.save();
    }
    let done = false;
    let i = 0;
    while (!done && i < 50) {
      done = true;
      i += 1;
      for (const client of clients) {
        if (client.length != count) {
          done = false;
          await delay(10);
          break;
        }
      }
    }
    for (const client of clients) {
      expect(client.length).toEqual(count);
      expect(client.getAll()).toEqual(combined);
    }
  });

  it("close", async () => {
    for (const client of clients) {
      await client.clear();
      await client.close();
    }
  });
});

describe("tests involving null/undefined values and delete", () => {
  let kv1;
  let kv2;
  const name = `test-${Math.round(100 * Math.random())}`;

  it("creates the dkv twice", async () => {
    kv1 = await createDkv({ name, noAutosave: true, noCache: true });
    kv2 = await createDkv({ name, noAutosave: true, noCache: true });
    expect(kv1.getAll()).toEqual({});
    expect(kv1 === kv2).toBe(false);
  });

  //   it("sets a value to null, which is fully supported like any other value", () => {
  //     kv1.a = null;
  //     expect(kv1.a).toBe(null);
  //     expect(kv1.a === null).toBe(true);
  //     expect(kv1.length).toBe(1);
  //   });

  it("make sure null value sync's as expected", async () => {
    kv1.a = null;
    await kv1.save();
    await wait({ until: () => kv2.has("a") });
    expect(kv2.a).toBe(null);
    expect(kv2.a === null).toBe(true);
    expect(kv2.length).toBe(1);
  });

  it("sets a value to undefined, which is the same as deleting a value", () => {
    kv1.a = undefined;
    expect(kv1.has("a")).toBe(false);
    expect(kv1.a).toBe(undefined);
    expect(kv1.a === undefined).toBe(true);
    expect(kv1.length).toBe(0);
    expect(kv1.getAll()).toEqual({});
  });

  it("make sure undefined (i.e., delete) sync's as expected", async () => {
    await kv1.save();
    await wait({ until: () => kv2.a === undefined });
    expect(kv2.a).toBe(undefined);
    expect(kv2.a === undefined).toBe(true);
    expect(kv2.length).toBe(0);
    expect(kv1.getAll()).toEqual({});
  });

  it("makes sure using '' as a key works", async () => {
    kv1.set("", 10);
    expect(kv1.get("")).toEqual(10);
    await kv1.save();
    if (kv2.get("") != 10) {
      await once(kv2, "change");
    }
    expect(kv2.get("")).toEqual(10);
  });

  it("close", async () => {
    await kv1.clear();
    await kv1.close();
    await kv2.clear();
    await kv2.close();
  });
});

describe("ensure there isn't a really obvious subscription leak", () => {
  let client;

  it("create a client, which initially has only one subscription (the inbox)", async () => {
    client = connect();
    expect(client.numSubscriptions()).toBe(1);
  });

  const count = 10;
  it(`creates and closes ${count} streams and checks there is no leak`, async () => {
    const before = client.numSubscriptions();
    // create
    const a: any = [];
    for (let i = 0; i < count; i++) {
      a[i] = await createDkv({
        name: `${Math.random()}`,
        noAutosave: true,
        noCache: true,
      });
    }
    // NOTE: in fact there's very unlikely to be a subscription leak, since
    // dkv's don't use new subscriptions -- they all use requestMany instead
    // to a common inbox prefix, and there's just one subscription for an inbox.
    expect(client.numSubscriptions()).toEqual(before);
    for (let i = 0; i < count; i++) {
      await a[i].close();
    }
    const after = client.numSubscriptions();
    expect(after).toBe(before);

    // also check count on server went down.
    expect((await client.getSubscriptions()).size).toBe(before);
  });

  it("does another leak test, but with a set operation each time", async () => {
    const before = client.numSubscriptions();
    // create
    const a: any = [];
    for (let i = 0; i < count; i++) {
      a[i] = await createDkv({
        name: `${Math.random()}`,
        noAutosave: true,
        noCache: true,
      });
      a[i].set(`${i}`, i);
      await a[i].save();
    }
    // this isn't going to be a problem:
    expect(client.numSubscriptions()).toEqual(before);
    for (let i = 0; i < count; i++) {
      await a[i].close();
    }
    const after = client.numSubscriptions();
    expect(after).toBe(before);
  });
});

describe("test creating and closing a dkv doesn't leak subscriptions", () => {
  let client;
  let kv;
  let name = "sub.count";
  let subs;

  it("make a new client and count subscriptions", async () => {
    client = connect();
    await once(client, "connected");
    subs = client.numSubscriptions();
    expect(subs).toBe(1); // the inbox
  });

  it("creates dkv", async () => {
    kv = await createDkv({ name });
    kv.set("x", 5);
    await wait({ until: () => kv.length == 1 });
  });

  it("close the kv and confirm subs returns to 1", async () => {
    kv.close();
    await expect(() => {
      client.numSubscriptions() == 1;
    });
  });
});

afterAll(after);
