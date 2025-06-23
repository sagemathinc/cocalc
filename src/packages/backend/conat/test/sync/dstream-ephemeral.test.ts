/*
Testing basic ops with dsteam (distributed streams), but all are ephemeral.

The first tests are initially similar to those for dstream.test.ts, but with
{ephemeral: true}.  There are also further tests of the client/server aspects.

DEVELOPMENT:

pnpm test ./dstream-ephemeral.test.ts 

*/

import { connect, before, after, wait } from "@cocalc/backend/conat/test/setup";
import { createDstreamEphemeral as create } from "./util";
import { dstream as createDstream0 } from "@cocalc/backend/conat/sync";
//import { delay } from "awaiting";

beforeAll(before);

async function createDstream<T>(opts) {
  return await createDstream0<T>({
    noCache: true,
    noAutosave: true,
    ephemeral: true,
    ...opts,
  });
}

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

  it("confirm ephemeralness: closes and re-opens stream and confirms message is NOT there", async () => {
    const name = s.name;
    await s.save();
    // close s:
    await s.close();
    // using s fails
    expect(s.getAll).toThrow("closed");
    // wait for server to discard stream data
    // (it's instant right now!)
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
  let client2;
  it("creates two distinct dstream objects s1 and s2 with the same name", async () => {
    client2 = connect();
    s1 = await createDstream({ name });
    s2 = await createDstream({ client: client2, name });
    // definitely distinct
    expect(s1 === s2).toBe(false);
  });

  it("writes to s1 and observes s2 doesn't see anything until we save", async () => {
    s1.push("hello");
    expect(s1[0]).toEqual("hello");
    expect(s2.length).toEqual(0);
    await s1.save();
    await wait({ until: () => s2[0] == "hello" });
    expect(s2[0]).toEqual("hello");
    expect(s2.getAll()).toEqual(["hello"]);
  });

  it("now write to s2 and save and see that reflected in s1", async () => {
    s2.push("hi from s2");
    await s2.save();
    await wait({ until: () => s1[1] == "hi from s2" && s2[1] == "hi from s2" });
    expect(s1[1]).toEqual("hi from s2");
    expect(s2[1]).toEqual("hi from s2");
  });

  it("s1.stream and s2.stream should be the same right now", () => {
    expect(s1.stream.getAll()).toEqual(["hello", "hi from s2"]);
    expect(s2.stream.getAll()).toEqual(["hello", "hi from s2"]);
  });

  it("s1 and s2 should be the same right now", () => {
    expect(s1.getAll()).toEqual(["hello", "hi from s2"]);
    expect(s2.getAll()).toEqual(["hello", "hi from s2"]);
  });

  it("cleans up", () => {
    s1.close();
    s2.close();
    client2.close();
  });
});

describe("create two dstreams and test sync with parallel save", () => {
  const name = `test-${Math.random()}`;
  let s1, s2;
  let client2;
  it("creates two distinct dstream objects s1 and s2 with the same name", async () => {
    client2 = connect();
    s1 = await createDstream({ name });
    s2 = await createDstream({ client: client2, name });
    // definitely distinct
    expect(s1 === s2).toBe(false);
  });

  it("write to s1 and s2 and save at the same time", async () => {
    s1.push("s1");
    s2.push("s2");
    // our changes are reflected locally
    expect(s1.getAll()).toEqual(["s1"]);
    expect(s2.getAll()).toEqual(["s2"]);
    // now kick off the two saves *in parallel*
    s1.save();
    s2.save();
    await wait({ until: () => s1.length >= 2 && s2.length >= 2 });
    expect(s1.getAll()).toEqual(s2.getAll());
  });

  it("cleans up", () => {
    client2.close();
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
    await wait({ until: () => s.seq(0) > 0 });
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
    await wait({ until: () => s.time(1) != null });
    expect(s.time(0).getTime()).toBeLessThanOrEqual(s.time(1).getTime());
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
    await wait({ until: () => s.seq(2) != null });
    seq = [s.seq(0), s.seq(1), s.seq(2)];
    // tests partly that these are integers...
    const n = seq.reduce((a, b) => a + b, 0);
    expect(typeof n).toBe("number");
    expect(n).toBeGreaterThan(2);
  });

  let t;
  it("it opens another copy of the stream, but starting with the last sequence number, so only one message", async () => {
    const client = connect();
    t = await createDstream({
      client,
      name,
      noAutosave: true,
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
    // [ ] TODO rewrite this save to send everything in a single message
    // which gets chunked, will we be much faster, then change the count
    // above to 1000 or 10000.
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
    expect(client.numSubscriptions()).toBe(0);
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

afterAll(after);
