/*
Testing basic ops with *persistent* dstreams.

DEVELOPMENT:

pnpm test ./dstream.test.ts

*/

import { createDstream as create } from "./util";
import { dstream as createDstream } from "@cocalc/backend/conat/sync";
import { once } from "@cocalc/util/async-utils";
import { connect, before, after, wait } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

jest.setTimeout(10000);

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
    while (s1[1] != "hi from s2") {
      await once(s1, "change");
    }
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
    await wait({
      until: () => {
        return s1.length == 4 && s2.length == 4;
      },
    });
    expect(s1.getAll()).toEqual(s2.getAll());
    expect(new Set(s1.getAll())).toEqual(
      new Set(["hello", "hi from s2", "s1", "s2"]),
    );
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
    // noAutosave: false is the default:
    s = await createDstream({ name, noAutosave: false });
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
    expect(s.start_seq).toEqual(seq[2]);
  });

  it("it then pulls in the previous message, so now two messages are loaded", async () => {
    await s.load({ start_seq: seq[1] });
    expect(s.length).toBe(2);
    expect(s.getAll()).toEqual([2, 3]);
    expect(s.start_seq).toEqual(seq[1]);
  });

  it("a bigger example involving loading older messages", async () => {
    for (let i = 4; i < 100; i++) {
      s.push(i);
    }
    await s.save();
    const last = s.seq(s.length - 1);
    const mid = s.seq(s.length - 50);
    await s.close();
    s = await createDstream({
      name,
      noAutosave: true,
      start_seq: last,
    });
    expect(s.length).toBe(1);
    expect(s.getAll()).toEqual([99]);
    expect(s.start_seq).toEqual(last);

    await s.load({ start_seq: mid });
    expect(s.length).toEqual(50);
    expect(s.start_seq).toEqual(mid);
    for (let i = 0; i < 50; i++) {
      expect(s.get(i)).toBe(i + 50);
    }

    await s.load({ start_seq: 0 });
    for (let i = 0; i < 99; i++) {
      expect(s.get(i)).toBe(i + 1);
    }
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

describe("ensure there isn't a really obvious subscription leak", () => {
  let client;

  it("create a client, which initially has only one subscription (the inbox)", async () => {
    client = connect();
    await client.getInbox();
    expect(client.numSubscriptions()).toBe(1);
  });

  const count = 100;
  it(`creates and closes ${count} streams and checks there is no leak`, async () => {
    const before = client.numSubscriptions();
    // create
    const a: any = [];
    for (let i = 0; i < count; i++) {
      a[i] = await createDstream({
        name: `${Math.random()}`,
      });
    }
    for (let i = 0; i < count; i++) {
      await a[i].close();
    }
    const after = client.numSubscriptions();
    expect(after).toBe(before);

    // also check count on server went down.
    expect((await client.getSubscriptions()).size).toBe(before);
  });

  it("does another leak test, but with a publish operation each time", async () => {
    const before = client.numSubscriptions();
    // create
    const a: any = [];
    for (let i = 0; i < count; i++) {
      a[i] = await createDstream({
        name: `${Math.random()}`,
        noAutosave: true,
      });
      a[i].publish(i);
      await a[i].save();
    }
    for (let i = 0; i < count; i++) {
      await a[i].close();
    }
    const after = client.numSubscriptions();
    expect(after).toBe(before);
  });
});

describe("test delete of messages from stream", () => {
  let client1, client2, s1, s2;
  const name = "test-delete";
  it("create two clients", async () => {
    client1 = connect();
    client2 = connect();
    s1 = await createDstream({
      client: client1,
      name,
      noAutosave: true,
      noCache: true,
    });
    s2 = await createDstream({
      client: client2,
      name,
      noAutosave: true,
      noCache: true,
    });
  });

  it("writes message one, confirm seen by other, then delete and confirm works", async () => {
    s1.push("hello");
    await s1.save();
    await wait({ until: () => s2.length > 0 });
    s1.delete({ all: true });
    await wait({ until: () => s2.length == 0 && s1.length == 0 });
  });

  it("same delete test as above but with a few more items and delete on s2 instead", async () => {
    for (let i = 0; i < 10; i++) {
      s1.push(i);
    }
    await s1.save();
    await wait({ until: () => s2.length == 10 });
    s2.delete({ all: true });
    await wait({ until: () => s2.length == 0 && s1.length == 0 });
  });

  it("delete specific index", async () => {
    s1.push("x", "y", "z");
    await s1.save();
    await wait({ until: () => s2.length == 3 });
    s2.delete({ last_index: 1 });
    await wait({ until: () => s2.length == 1 && s1.length == 1 });
    expect(s1.get()).toEqual(["z"]);
  });

  it("delete specific seq number", async () => {
    s1.push("x", "y");
    await s1.save();
    expect(s1.get()).toEqual(["z", "x", "y"]);
    const seq = s1.seq(1);
    const { seqs } = await s1.delete({ seq });
    expect(seqs).toEqual([seq]);
    await wait({ until: () => s2.length == 2 && s1.length == 2 });
    expect(s1.get()).toEqual(["z", "y"]);
  });

  it("delete up to a sequence number", async () => {
    s1.push("x", "y");
    await s1.save();
    expect(s1.get()).toEqual(["z", "y", "x", "y"]);
    const seq = s1.seq(1);
    const { seqs } = await s1.delete({ last_seq: seq });
    expect(seqs.length).toBe(2);
    expect(seqs[1]).toBe(seq);
    await wait({ until: () => s1.length == 2 });
    expect(s1.get()).toEqual(["x", "y"]);
  });
});

afterAll(after);
