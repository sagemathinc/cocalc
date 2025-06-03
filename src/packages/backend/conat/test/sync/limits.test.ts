/*
Testing the limits.

DEVELOPMENT:

pnpm test ./limits.test.ts

*/

import { dkv as createDkv } from "@cocalc/backend/conat/sync";
import { dstream as createDstream } from "@cocalc/backend/conat/sync";
import { delay } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import {
  before,
  after,
  wait,
  connect,
  client,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("create a dkv with limit on the total number of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ client, name, config: { max_msgs: 2 } });
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

describe("create a dkv with limit on age of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ client, name, config: { max_age: 50 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds 2 keys, then a third, and sees first two are gone due to aging out", async () => {
    kv.a = 10;
    kv.b = 20;
    expect(kv.a).toEqual(10);
    expect(kv.b).toEqual(20);
    await kv.save();
    await kv.config();
    await delay(50);
    await kv.config();
    await delay(10);
    expect(kv.has("a")).toBe(false);
    expect(kv.has("b")).toBe(false);
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe("create a dkv with limit on total bytes of keys, and confirm auto-delete works", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ client, name, config: { max_bytes: 100 } });
    expect(kv.getAll()).toEqual({});
  });

  it("adds a key, then a second, and sees first one is gone due to bytes", async () => {
    kv.a = "x".repeat(50);
    kv.b = "x".repeat(55);
    expect(kv.getAll()).toEqual({ a: "x".repeat(50), b: "x".repeat(55) });
    await kv.save();
    expect(kv.has("b")).toBe(true);
    await wait({
      until: async () => {
        await kv.config();
        return !kv.has("a");
      },
    });
    expect(kv.getAll()).toEqual({ b: "x".repeat(55) });
  });

  it("closes the kv", async () => {
    await kv.clear();
    await kv.close();
  });
});

describe("create a dkv with limit on max_msg_size, and confirm writing small messages works but writing a big one result in a 'reject' event", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("creates the dkv", async () => {
    kv = await createDkv({ client, name, config: { max_msg_size: 100 } });
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

describe("create a dstream with limit on the total number of messages, and confirm max_msgs, max_age works", () => {
  let s, s2;
  const name = `test-${Math.random()}`;

  it("creates the dstream and another with a different client", async () => {
    s = await createDstream({ client, name, config: { max_msgs: 2 } });
    s2 = await createDstream({
      client: connect(),
      name,
      config: { max_msgs: 2 },
      noCache: true,
    });
    expect(s.get()).toEqual([]);
    expect((await s.config()).max_msgs).toBe(2);
    expect((await s2.config()).max_msgs).toBe(2);
  });

  it("push 2 messages, then a third, and see first is gone and that this is reflected on both clients", async () => {
    expect((await s.config()).max_msgs).toBe(2);
    expect((await s2.config()).max_msgs).toBe(2);
    s.push("a");
    s.push("b");
    await wait({ until: () => s.length == 2 && s2.length == 2 });
    expect(s2.get()).toEqual(["a", "b"]);
    s.push("c");
    await wait({
      until: () =>
        s.get(0) != "a" &&
        s.get(1) == "c" &&
        s2.get(0) != "a" &&
        s2.get(1) == "c",
    });
    expect(s.getAll()).toEqual(["b", "c"]);
    expect(s2.getAll()).toEqual(["b", "c"]);

    // also check limits ar  enforced if we close, then open new one:
    await s.close();
    s = await createDstream({ client, name, config: { max_msgs: 2 } });
    expect(s.getAll()).toEqual(["b", "c"]);

    await s.config({ max_msgs: -1 });
  });

  it("verifies that max_age works", async () => {
    await s.save();
    expect(s.hasUnsavedChanges()).toBe(false);
    await delay(300);
    s.push("new");
    await s.config({ max_age: 20 }); // anything older than 20ms should be deleted
    await wait({ until: () => s.length == 1 });
    expect(s.getAll()).toEqual(["new"]);
    await s.config({ max_age: -1 });
  });

  it("verifies that ttl works", async () => {
    const conf = await s.config();
    expect(conf.allow_msg_ttl).toBe(false);
    const conf2 = await s.config({ max_age: -1, allow_msg_ttl: true });
    expect(conf2.allow_msg_ttl).toBe(true);

    s.publish("ttl-message", { ttl: 50 });
    await s.save();
    await wait({
      until: async () => {
        await s.config();
        return s.length == 1;
      },
    });
    expect(s.get()).toEqual(["new"]);
  });

  it("verifies that max_bytes works -- publishing something too large causes everything to end up gone", async () => {
    const conf = await s.config({ max_bytes: 100 });
    expect(conf.max_bytes).toBe(100);
    s.publish("x".repeat(1000));
    await s.config();
    await wait({ until: () => s.length == 0 });
    expect(s.length).toBe(0);
  });

  it("max_bytes -- publish something then another thing that causes the first to get deleted", async () => {
    s.publish("x".repeat(75));
    s.publish("y".repeat(90));
    await wait({
      until: async () => {
        await s.config();
        return s.length == 1;
      },
    });
    expect(s.get()).toEqual(["y".repeat(90)]);
    await s.config({ max_bytes: -1 });
  });

  it("verifies that max_msg_size rejects messages that are too big", async () => {
    await s.config({ max_msg_size: 100 });
    expect((await s.config()).max_msg_size).toBe(100);
    s.publish("x".repeat(70));
    await expect(async () => {
      await s.stream.publish("x".repeat(150));
    }).rejects.toThrowError("max_msg_size");
    await s.config({ max_msg_size: 200 });
    s.publish("x".repeat(150));
    await s.config({ max_msg_size: -1 });
    expect((await s.config()).max_msg_size).toBe(-1);
  });

  it("closes the stream", async () => {
    await s.close();
    await s2.close();
  });
});

describe("create a dstream with limit on max_age, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ client, name, config: { max_age: 50 } });
  });

  it("push a message, then another and see first disappears", async () => {
    s.push({ a: 10 });
    await delay(75);
    s.push({ b: 20 });
    expect(s.get()).toEqual([{ a: 10 }, { b: 20 }]);
    await wait({
      until: async () => {
        await s.config();
        return s.length == 1;
      },
    });
    expect(s.getAll()).toEqual([{ b: 20 }]);
  });

  it("closes the stream", async () => {
    await s.delete({ all: true });
    await s.close();
  });
});

describe("create a dstream with limit on max_bytes, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    // note: 60 and not 40 due to slack for headers
    s = await createDstream({ client, name, config: { max_bytes: 60 } });
  });

  it("push a message, then another and see first disappears", async () => {
    s.push("x".repeat(40));
    s.push("x".repeat(45));
    s.push("x");
    if (!s.isStable()) {
      await once(s, "stable");
    }
    expect(s.getAll()).toEqual(["x".repeat(45), "x"]);
  });

  it("closes the stream", async () => {
    await s.delete({ all: true });
    await s.close();
  });
});

describe("create a dstream with limit on max_msg_size, and confirm auto-delete works", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({ client, name, config: { max_msg_size: 50 } });
  });

  it("push a message, then another and see first disappears", async () => {
    const rejects: any[] = [];
    s.on("reject", ({ mesg }) => {
      rejects.push(mesg);
    });
    s.push("x".repeat(40));
    s.push("y".repeat(60)); // silently vanishes (well a reject event is emitted)
    s.push("x");
    await wait({
      until: async () => {
        await s.config();
        return s.length == 2;
      },
    });
    expect(s.getAll()).toEqual(["x".repeat(40), "x"]);
    expect(rejects).toEqual(["y".repeat(60)]);
  });

  it("closes the stream", async () => {
    await s.close();
  });
});

describe("test discard_policy 'new' where writes are rejected rather than old data being deleted, for max_bytes and max_msgs", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({
      client,
      name,
      // we can write at most 300 bytes and 3 messages.  beyond that we
      // get reject events.
      config: { max_bytes: 300, max_msgs: 3, discard_policy: "new" },
    });
    const rejects: any[] = [];
    s.on("reject", ({ mesg }) => {
      rejects.push(mesg);
    });
    s.publish("x");
    s.publish("y");
    s.publish("w");
    s.publish("foo");

    await wait({
      until: async () => {
        await s.config();
        return rejects.length == 1;
      },
    });
    expect(s.getAll()).toEqual(["x", "y", "w"]);
    expect(rejects).toEqual(["foo"]);

    s.publish("x".repeat(299));
    await wait({
      until: async () => {
        await s.config();
        return rejects.length == 2;
      },
    });
    expect(s.getAll()).toEqual(["x", "y", "w"]);
    expect(rejects).toEqual(["foo", "x".repeat(299)]);
  });

  it("closes the stream", async () => {
    await s.close();
  });
});

describe("test rate limiting", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates the dstream", async () => {
    s = await createDstream({
      client,
      name,
      // we can write at most 300 bytes and 3 messages.  beyond that we
      // get reject events.
      config: {
        max_bytes_per_second: 300,
        max_msgs_per_second: 3,
        discard_policy: "new",
      },
    });
    const rejects: any[] = [];
    s.on("reject", ({ mesg }) => {
      rejects.push(mesg);
    });
  });

  it("closes the stream", async () => {
    await s.close();
  });
});

import { EPHEMERAL_MAX_BYTES } from "@cocalc/conat/persist/storage";
describe(`ephemeral streams always have a hard cap of ${EPHEMERAL_MAX_BYTES} on max_bytes `, () => {
  let s;
  it("creates a non-ephemeral dstream and checks no automatic max_bytes set", async () => {
    const s1 = await createDstream({
      client,
      name: "test-NON-ephemeral",
      ephemeral: false,
    });
    expect((await s1.config()).max_bytes).toBe(-1);
    s1.close();
  });

  it("creates an ephemeral dstream and checks max bytes automatically set", async () => {
    s = await createDstream({
      client,
      name: "test-ephemeral",
      ephemeral: true,
    });
    expect((await s.config()).max_bytes).toBe(EPHEMERAL_MAX_BYTES);
  });

  it("trying to set larger doesn't work", async () => {
    expect(
      (await s.config({ max_bytes: 2 * EPHEMERAL_MAX_BYTES })).max_bytes,
    ).toBe(EPHEMERAL_MAX_BYTES);
    expect((await s.config()).max_bytes).toBe(EPHEMERAL_MAX_BYTES);
  });

  it("setting it smaller is allowed", async () => {
    expect(
      (await s.config({ max_bytes: EPHEMERAL_MAX_BYTES / 2 })).max_bytes,
    ).toBe(EPHEMERAL_MAX_BYTES / 2);
    expect((await s.config()).max_bytes).toBe(EPHEMERAL_MAX_BYTES / 2);
  });
});

afterAll(after);
