/*
Testing the limits.

DEVELOPMENT:

pnpm test ./limits.test.ts

*/

import { dkv as createDkv } from "@cocalc/backend/conat/sync";
import { dstream as createDstream } from "@cocalc/backend/conat/sync";
import { delay } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import { before, after } from "@cocalc/backend/conat/test/setup";


beforeAll(before);

describe.skip("create a dkv with limit on the total number of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name, limits: { max_msgs: 2 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds 2 keys, then a third, and sees first is gone", async () => {
    kv.a = 10;
    kv.b = 20;
    expect(kv.a).toEqual(10);
    expect(kv.b).toEqual(20);
    kv.c = 30;
    expect(kv.c).toEqual(30);
    // have to wait until it's all saved and acknowledged before enforcing limit
    if (!kv.isStable()) {
      await once(kv, "stable");
    }
    // cause limit enforcement immediately so unit tests aren't slow
    await kv.generalDKV.kv.enforceLimitsNow();
    // next change is the enforcement happening
    if (kv.has("a")) {
      await once(kv, "change", 500);
    }
    // and confirm it
    expect(kv.a).toBe(undefined);
    expect(kv.getAll()).toEqual({ b: 20, c: 30 });
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe.skip("create a dkv with limit on age of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name, limits: { max_age: 50 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds 2 keys, then a third, and sees first two are gone due to aging out", async () => {
    kv.a = 10;
    kv.b = 20;
    expect(kv.a).toEqual(10);
    expect(kv.b).toEqual(20);
    await kv.save();
    await delay(75);
    kv.c = 30;
    expect(kv.c).toEqual(30);
    if (!kv.isStable()) {
      await once(kv, "stable");
    }
    await kv.generalDKV.kv.enforceLimitsNow();
    if (kv.has("a")) {
      await once(kv, "change", 500);
    }
    expect(kv.getAll()).toEqual({ c: 30 });
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe.skip("create a dkv with limit on total bytes of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name, limits: { max_bytes: 100 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds a key, then a seocnd, and sees first one is gone due to bytes", async () => {
    kv.a = "x".repeat(50);
    await kv.save();
    kv.b = "x".repeat(75);
    if (!kv.isStable()) {
      await once(kv, "stable");
    }
    await delay(250);
    await kv.generalDKV.kv.enforceLimitsNow();
    if (kv.has("a")) {
      await once(kv, "change", 500);
    }
    expect(kv.getAll()).toEqual({ b: "x".repeat(75) });
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe.skip("create a dkv with limit on max_msg_size, and confirm writing small messages works but writing a big one result in a 'reject' event", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ name, limits: { max_msg_size: 100 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds a key, then a second big one results in a 'reject' event", async () => {
    const rejects: { key: string; value: string }[] = [];
    kv.once("reject", (x) => {
      rejects.push(x);
    });
    kv.a = "x".repeat(50);
    await kv.save();
    kv.b = "x".repeat(150);
    await kv.save();
    expect(rejects).toEqual([{ key: "b", value: "x".repeat(150) }]);
    expect(kv.has("b")).toBe(false);
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe.skip("create a dstream with limit on the total number of messages, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ name, limits: { max_msgs: 2 } });
    expect(s.get()).toEqual([]);
  });

  it("push 2 messages, then a third, and sees first is gone", async () => {
    s.push({ a: 10 });
    s.push({ b: 20 });
    expect(s.get()).toEqual([{ a: 10 }, { b: 20 }]);
    s.push({ c: 30 });
    expect(s.get(2)).toEqual({ c: 30 });
    // have to wait until it's all saved and acknowledged before enforcing limit
    if (!s.isStable()) {
      await once(s, "stable");
    }
    // cause limit enforcement immediately so unit tests aren't slow
    await s.stream.enforceLimitsNow();
    expect(s.getAll()).toEqual([{ b: 20 }, { c: 30 }]);

    // also check limits was enforced if we close, then open new one:
    await s.close();
    s = await createDstream({ name, limits: { max_msgs: 2 } });
    expect(s.getAll()).toEqual([{ b: 20 }, { c: 30 }]);
  });

  it("closes the stream", async () => {
    await s.delete({all:true});
    await s.close();
  });
});

describe.skip("create a dstream with limit on max_age, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ name, limits: { max_age: 50 } });
  });

  it("push a message, then another and see first disappears", async () => {
    s.push({ a: 10 });
    await delay(100);
    s.push({ b: 20 });
    expect(s.get()).toEqual([{ a: 10 }, { b: 20 }]);
    if (!s.isStable()) {
      await once(s, "stable");
    }
    await s.stream.enforceLimitsNow();
    expect(s.getAll()).toEqual([{ b: 20 }]);
  });

  it("closes the stream", async () => {
    await s.delete({all:true});
    await s.close();
  });
});

describe.skip("create a dstream with limit on max_bytes, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ name, limits: { max_bytes: 50 } });
  });

  it("push a message, then another and see first disappears", async () => {
    s.push("x".repeat(40));
    s.push("x".repeat(45));
    s.push("x");
    if (!s.isStable()) {
      await once(s, "stable");
    }
    await s.stream.enforceLimitsNow();
    expect(s.getAll()).toEqual(["x".repeat(45), "x"]);
  });

  it("closes the stream", async () => {
    await s.delete({all:true});
    await s.close();
  });
});

describe.skip("create a dstream with limit on max_msg_size, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ name, limits: { max_msg_size: 50 } });
  });

  it("push a message, then another and see first disappears", async () => {
    const rejects: any[] = [];
    s.on("reject", ({ mesg }) => {
      rejects.push(mesg);
    });
    s.push("x".repeat(40));
    s.push("y".repeat(60)); // silently vanishes (well a reject event is emitted)
    s.push("x");
    if (!s.isStable()) {
      await once(s, "stable");
    }
    await s.stream.enforceLimitsNow();
    expect(s.getAll()).toEqual(["x".repeat(40), "x"]);

    expect(rejects).toEqual(["y".repeat(60)]);
  });

  it("closes the stream", async () => {
    await s.delete({all:true});
    await s.close();
  });
});

afterAll(after);