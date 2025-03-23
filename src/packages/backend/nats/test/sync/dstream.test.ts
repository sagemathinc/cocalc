/*
Testing basic ops with dsteam (distributed streams)

DEVELOPMENT:

pnpm exec jest --watch --forceExit "dstream.test.ts"

*/

import { createDstream as create } from "./util";
import { dstream as createDstream } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";

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

  it("confirm persistence: closes and re-opens stream and confirms message is still there", async () => {
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
    // make sure it has our message
    expect(t.getAll()).toEqual([mesg]);
  });
});

describe("create two dstreams and observe sync between them", () => {
  const name = `test-${Math.random()}`;
  let s1, s2;
  it("creates two distinct dstream objects s1 and s2 with the same name", async () => {
    s1 = await createDstream({ name, noAutosave: true, noCache: true });
    s2 = await createDstream({ name, noAutosave: true, noCache: true });
    // definitely distinct
    expect(s1 === s2).toBe(false);
  });

  it("writes to s1 and observes s2 doesn't see anything until we save", async () => {
    s1.push("hello");
    expect(s1[0]).toEqual("hello");
    expect(s2.length).toEqual(0);
    s1.save();
    await once(s2, "change");
    expect(s2[0]).toEqual("hello");
    expect(s2.getAll()).toEqual(["hello"]);
  });

  it("now write to s2 and save and see that reflected in s1", async () => {
    s2.push("hi from s2");
    s2.save();
    await once(s1, "change");
    expect(s1[1]).toEqual("hi from s2");
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
    if (s2.length != s1.length) {
      await once(s2, "change");
    }
    expect(s1.getAll()).toEqual(s2.getAll());
    // in fact s1,s2 is the order since we called s1.save first:
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

describe("closing also saves by default, but not if autosave is off", () => {
  let s;
  const name = `test-${Math.random()}`;

  it("creates stream and write a message", async () => {
    s = await createDstream({ name, noAutosave: false /* the default */ });
    s.push(389);
  });

  it("closes then opens and message is there, since autosave is on", async () => {
    await s.close();
    const t = await createDstream({ name });
    expect(t[0]).toEqual(389);
  });

  it("make another stream with autosave off, and close which causes LOSS OF DATA", async () => {
    const name = `test-${Math.random()}`;
    const s = await createDstream({ name, noAutosave: true });
    s.push(389);
    s.close();
    const t = await createDstream({ name, noAutosave: true });
    // data is gone forever!
    expect(t.length).toBe(0);
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
    await s.close();
  });

  let s;
  it("it opens the stream but starting with the last sequence number, so only one message", async () => {
    s = await createDstream({
      name,
      noAutosave: true,
      start_seq: seq[2],
    });
    expect(s.length).toBe(1);
    expect(s.getAll()).toEqual([3]);
  });

  it("it then pulls in the previous message, so now two messages are loaded", async () => {
    await s.load({ start_seq: seq[1] });
    expect(s.length).toBe(2);
    expect(s.getAll()).toEqual([2, 3]);
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
