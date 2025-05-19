/*
Testing basic ops with dsteam (distributed streams), but all are ephemeral.

The first tests are initially similar to those for dstream.test.ts, but with
{ephemeral: true, leader:true}.  There are also further tests of the client/server aspects.

DEVELOPMENT:

pnpm test estream.test.ts

*/

import { createDstreamEphemeral as create } from "./util";
import { dstream as createDstream0 } from "@cocalc/backend/conat/sync";
import { once } from "@cocalc/util/async-utils";

async function createDstream<T>(opts) {
  return await createDstream0<T>({ ephemeral: true, leader: true, ...opts });
}

describe("create a dstream and do some basic operations", () => {
  let s;

  it("creates stream", async () => {
    s = await create();
  });

  it("starts out empty", () => {
    expect(s.getAll()).toEqual([]);
    expect(s.length).toEqual(0);
  });

  const mesg = { stdout: "hello" };
  it("publishes a message to the stream and confirms it is there", () => {
    s.push(mesg);
    expect(s.getAll()).toEqual([mesg]);
    expect(s.length).toEqual(1);
    expect(s[0]).toEqual(mesg);
  });

  it("verifies that unsaved changes works properly", async () => {
    expect(s.hasUnsavedChanges()).toBe(true);
    expect(s.unsavedChanges()).toEqual([mesg]);
    await s.save();
    expect(s.hasUnsavedChanges()).toBe(false);
    expect(s.unsavedChanges()).toEqual([]);
  });

  it("confirm ephemeralness: closes and re-opens stream and confirms message is NOT there", async () => {
    const name = s.name;
    await s.save();
    // close s:
    await s.close();
    // using s fails
    expect(s.getAll).toThrow("closed");
    // create new stream with same name
    const t = await createDstream({ name });
    // ensure it is NOT just from the cache
    expect(s === t).toBe(false);
    // make sure it does NOT have our message (it should not -- it's ephemeral)
    expect(t.getAll()).toEqual([]);
  });
});

describe("create two dstreams and observe sync between them", () => {
  const name = `test-${Math.random()}`;
  let s1, s2;
  it("creates two distinct dstream objects s1 and s2 with the same name", async () => {
    s1 = await createDstream({ name, noAutosave: true, noCache: true });
    s2 = await createDstream({
      name,
      noAutosave: true,
      noCache: true,
      leader: false,
    });
    // definitely distinct
    expect(s1 === s2).toBe(false);
  });

  it("writes to s1 and observes s2 doesn't see anything until we save", async () => {
    s1.push("hello");
    expect(s1[0]).toEqual("hello");
    expect(s2.length).toEqual(0);
    await s1.save();
    while (s2[0] != "hello") {
      await once(s2, "change");
    }
    expect(s2[0]).toEqual("hello");
    expect(s2.getAll()).toEqual(["hello"]);
  });

  it("now write to s2 and save and see that reflected in s1", async () => {
    s2.push("hi from s2");
    await s2.save();
    while (s1[1] != "hi from s2") {
      await once(s1, "change");
    }
    expect(s1[1]).toEqual("hi from s2");
  });

  it("s1.stream and s2.stream should be the same right now", () => {
    expect(s1.stream.getAll()).toEqual(["hello", "hi from s2"]);
    expect(s2.stream.getAll()).toEqual(["hello", "hi from s2"]);
  });

  it("s1 and s2 should be the same right now", () => {
    expect(s1.getAll()).toEqual(["hello", "hi from s2"]);
    expect(s2.getAll()).toEqual(["hello", "hi from s2"]);
  });

  it("write to s1 and s2 and save at the same time and see some 'random choice' of order gets imposed by the server", async () => {
    s1.push("s1");
    s2.push("s2");
    // our changes are reflected locally
    expect(s1.getAll()).toEqual(["hello", "hi from s2", "s1"]);
    expect(s2.getAll()).toEqual(["hello", "hi from s2", "s2"]);
    // now kick off the two saves *in parallel*
    s1.save();
    s2.save();
    await once(s1, "change");
    while (s2.length != s1.length) {
      await once(s2, "change");
    }
    expect(s1.getAll()).toEqual(s2.getAll());
    expect(s1.getAll()).toEqual(["hello", "hi from s2", "s1", "s2"]);
  });
});

describe("get sequence number and time of message", () => {
  let s;

  it("creates stream and write message", async () => {
    s = await create();
    s.push("hello");
  });

  it("sequence number is initialized undefined because it is server assigned ", async () => {
    const n = s.seq(0);
    expect(n).toBe(undefined);
  });

  it("time also undefined because it is server assigned ", async () => {
    const t = s.time(0);
    expect(t).toBe(undefined);
  });

  it("save and get server assigned sequence number", async () => {
    s.save();
    await once(s, "change");
    const n = s.seq(0);
    expect(n).toBeGreaterThan(0);
  });

  it("get server assigned time", async () => {
    const t = s.time(0);
    // since testing on the same machine as server, these times should be close:
    expect(t.getTime() - Date.now()).toBeLessThan(5000);
  });

  it("publish another message and get next server number is bigger", async () => {
    const n = s.seq(0);
    s.push("there");
    await s.save();
    const m = s.seq(1);
    expect(m).toBeGreaterThan(n);
  });

  it("and time is bigger", async () => {
    if (s.time(1) == null) {
      await once(s, "change");
    }
    expect(s.time(0).getTime()).toBeLessThan(s.time(1).getTime());
  });
});

describe("testing start_seq", () => {
  const name = `test-${Math.random()}`;
  let seq;
  it("creates a stream and adds 3 messages, noting their assigned sequence numbers", async () => {
    const s = await createDstream({ name, noAutosave: true });
    s.push(1, 2, 3);
    expect(s.getAll()).toEqual([1, 2, 3]);
    // save, thus getting sequence numbers
    s.save();
    while (s.seq(2) == null) {
      s.save();
      await once(s, "change");
    }
    seq = [s.seq(0), s.seq(1), s.seq(2)];
    // tests partly that these are integers...
    const n = seq.reduce((a, b) => a + b, 0);
    expect(typeof n).toBe("number");
    expect(n).toBeGreaterThan(2);
  });

  let t;
  it("it opens another copy of the stream, but starting with the last sequence number, so only one message", async () => {
    t = await createDstream({
      name,
      noAutosave: true,
      leader: false,
      start_seq: seq[2],
    });
    expect(t.length).toBe(1);
    expect(t.getAll()).toEqual([3]);
    expect(t.start_seq).toEqual(seq[2]);
  });

  it("it then pulls in the previous message, so now two messages are loaded", async () => {
    await t.load({ start_seq: seq[1] });
    expect(t.length).toBe(2);
    expect(t.getAll()).toEqual([2, 3]);
    expect(t.start_seq).toEqual(seq[1]);
  });
});

describe("a little bit of a stress test", () => {
  const name = `test-${Math.random()}`;
  const count = 100;
  let s;
  it(`creates a stream and pushes ${count} messages`, async () => {
    s = await createDstream({
      name,
      noAutosave: true,
    });
    for (let i = 0; i < count; i++) {
      s.push({ i });
    }
    expect(s.length).toBe(count);
    // NOTE: warning -- this is **MUCH SLOWER**, e.g., 10x slower,
    // running under jest, hence why count is small.
    await s.save();
    expect(s.length).toBe(count);
  });
});

describe("dstream typescript test", () => {
  it("creates stream", async () => {
    const name = `test-${Math.random()}`;
    const s = await createDstream<string>({ name });

    // write a message with the correct type
    s.push("foo");

    // wrong type -- no way to test this, but if you uncomment
    // this you should get a typescript error:

    // s.push({ foo: "bar" });
  });
});

import { numSubscriptions } from "@cocalc/conat/client";

describe("ensure there are no NATS subscription leaks", () => {
  // There is some slight slack at some point due to the clock stuff,
  // inventory, etc.  It is constant and small, whereas we allocate
  // a large number of kv's in the test.
  const SLACK = 4;

  it("creates and closes many kv's and checks there is no leak", async () => {
    const before = numSubscriptions();
    const COUNT = 20;
    // create
    const a: any = [];
    for (let i = 0; i < COUNT; i++) {
      a[i] = await createDstream({
        name: `${Math.random()}`,
        noAutosave: true,
      });
    }
    for (let i = 0; i < COUNT; i++) {
      await a[i].close();
    }
    const after = numSubscriptions();
    expect(Math.abs(after - before)).toBeLessThan(SLACK);
  });

  it("does another leak test, but with a set operation each time", async () => {
    const before = numSubscriptions();
    const COUNT = 20;
    // create
    const a: any = [];
    for (let i = 0; i < COUNT; i++) {
      a[i] = await createDstream({
        name: `${Math.random()}`,
        noAutosave: true,
      });
      a[i].publish(i);
      await a[i].save();
    }
    for (let i = 0; i < COUNT; i++) {
      await a[i].purge();
      await a[i].close();
    }
    const after = numSubscriptions();
    expect(Math.abs(after - before)).toBeLessThan(SLACK);
  });
});
