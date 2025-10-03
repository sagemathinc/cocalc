/*
DEVELOPMENT:


pnpm test ./core-stream.test.ts

*/

import { connect, before, after } from "@cocalc/backend/conat/test/setup";
import {
  cstream,
  KEY_GC_THRESH,
  CoreStream,
} from "@cocalc/conat/sync/core-stream";
import { wait } from "@cocalc/backend/conat/test/util";
import { is_date as isDate } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { once } from "@cocalc/util/async-utils";

beforeAll(before);

describe("create a client, create an ephemeral core-stream, and do basic tests", () => {
  let client;
  let stream;
  let name = `test-${Math.random()}`;
  const opts = {
    name,
    ephemeral: true,
    noCache: true,
  };

  it("creates ephemeral core stream", async () => {
    client = connect();
    stream = await cstream({ client, ...opts });
    expect(stream.length).toBe(0);
  });

  it("publish some messages", async () => {
    // publish null
    await stream.publish(null);
    await wait({ until: () => stream.length == 1 });
    expect(stream.get(0)).toBe(null);
    expect(stream.length).toBe(1);

    // publish a Buffer stays a Buffer
    await stream.publish(Buffer.from("xyz"));
    await wait({ until: () => stream.length == 2 });
    expect(stream.get(1)).toEqual(Buffer.from("xyz"));
    expect(Buffer.isBuffer(stream.get(1))).toBe(true);
    expect(stream.length).toBe(2);

    // publish a Date stays a Date
    const now = new Date();
    await stream.publish(now);
    await wait({ until: () => stream.get(2) != null });
    expect(stream.get(2)).toEqual(now);
    expect(isDate(stream.get(2))).toEqual(true);
  });

  it("publishing undefined is not allowed", async () => {
    await expect(
      async () => await stream.publish(undefined),
    ).rejects.toThrow("must not be 'undefined'");
  });

  it("a second client has the same messages", async () => {
    const client2 = connect();
    const stream2 = await cstream({
      client: client2,
      ...opts,
    });
    await wait({ until: () => stream2.length == 3 });
    expect(stream2.getAll()).toEqual(stream.getAll());
    stream2.close();
  });

  it("close and create and see that it's ephemeral", async () => {
    // with heavy parallel load when testing a lot at once, this
    // can take more than one try:
    await wait({
      until: async () => {
        stream.close();
        await delay(2500);
        stream = await cstream({ client, ...opts });
        return stream.length == 0;
      },
    });
    expect(stream.length).toBe(0);
  });

  const count = 100;
  it(`publish ${count} messages and observe it works`, async () => {
    const v: number[] = [];
    for (let i = 0; i < 100; i++) {
      await stream.publish(i);
      v.push(i);
    }
    await wait({ until: () => stream.length == 100 });
    expect(stream.length).toBe(100);
    expect(stream.getAll()).toEqual(v);
  });

  it("publish a message with a header", async () => {
    const n = stream.length;
    await stream.publish("body", { headers: { foo: { 10: 5 } } });
    await wait({ until: () => stream.length > n });
    const headers = stream.headers(stream.length - 1);
    expect(headers).toEqual(expect.objectContaining({ foo: { 10: 5 } }));
  });

  it("some time consistency checks", () => {
    expect(
      Math.abs(stream.time(stream.length - 1).valueOf() - Date.now()),
    ).toBeLessThan(100);
    const times = stream.times();
    expect(times.length).toBe(stream.length);
    expect(times.slice(-1)[0]).toEqual(stream.time(stream.length - 1));
  });

  it("stats consistency check", () => {
    const stats = stream.stats();
    expect(stats.count).toBe(stream.length);
    expect(stats.bytes).not.toBeNaN();
    expect(stats.bytes).toBeGreaterThan(100);
  });

  it("delete everything in the stream", async () => {
    await stream.delete({ all: true });
    await wait({ until: () => stream.length == 0 });
    expect(stream.length).toBe(0);
    const stats = stream.stats();
    expect(stats.count).toBe(0);
    expect(stats.bytes).toBe(0);
  });

  it("clean up", () => {
    stream.close();
    client.close();
  });
});

describe("test basic key:value functionality for persistent core stream", () => {
  let client;
  let stream;
  let name = "kv0";

  it("creates persistent core stream", async () => {
    client = connect();
    stream = await cstream({ client, name, ephemeral: false });
    expect(stream.length).toBe(0);
    expect(stream.start_seq).toBe(undefined);
  });

  let seq;

  it("writes a key:value and confirms it was written", async () => {
    await stream.setKv("key", "value");
    expect(await stream.getKv("key")).toEqual("value");
    seq = stream.seqKv("key");
  });

  it("also confirm via getAllKv", () => {
    expect(stream.getAllKv()).toEqual({ key: "value" });
  });

  it("closes and reopens stream, to confirm the key was persisted", async () => {
    await stream.close();
    expect(stream.kv).toBe(undefined);
    stream = await cstream({ client, name, ephemeral: false });
    expect(stream.hasKv("key")).toBe(true);
    expect(stream.hasKv("key2")).toBe(false);
    expect(stream.length).toBe(1);
    expect(await stream.getKv("key")).toEqual("value");
    expect(stream.seqKv("key")).toBe(seq);
  });

  let client2;
  let stream2;
  it("create a second client and observe it sees the correct value", async () => {
    client2 = connect();
    stream2 = await cstream({
      client: client2,
      name,
      ephemeral: false,
      noCache: true,
    });
    expect(await stream2.getKv("key")).toEqual("value");
  });

  it("modify the value via the second client and see it change in the first", async () => {
    await stream2.setKv("key", "value2");
    await wait({ until: () => stream.getKv("key") == "value2" });
  });

  it("verify that the overwritten message is cleared to save space in both streams", () => {
    expect(stream.get(0)).not.toBe(undefined);
    expect(stream2.get(0)).not.toBe(undefined);
    stream.gcKv();
    stream2.gcKv();
    expect(stream.get(0)).toBe(undefined);
    expect(stream2.get(0)).toBe(undefined);
    expect(stream.headers(0)).toBe(undefined);
    expect(stream2.headers(0)).toBe(undefined);
  });

  it("write a large key:value, then write it again to cause automatic garbage collection", async () => {
    await stream.setKv("key", Buffer.from("x".repeat(KEY_GC_THRESH + 10)));
    expect(stream.get(stream.length - 1).length).toBe(KEY_GC_THRESH + 10);
    await stream.setKv("key", Buffer.from("x".repeat(KEY_GC_THRESH + 10)));
    // it's gone
    expect(stream.get(stream.length - 2)).toBe(undefined);
  });

  it("close and reload and note there is only one item in the stream (the first message was removed since it is no longer needed)", async () => {
    await stream.close();
    expect(stream.kv).toBe(undefined);
    stream = await cstream({ client, name, ephemeral: false });
    expect(stream.length).toBe(1);
    expect(stream.seqKv(0)).toBe(stream2.seqKv(1));
  });

  it("cleans up", () => {
    stream.close();
    stream2.close();
    client.close();
    client2.close();
  });
});

describe("test key:value delete", () => {
  let client;
  let stream;
  let name = "kvd";
  let client2;
  let stream2;

  it("creates new persistent core stream with two copies/clients", async () => {
    client = connect();
    stream = await cstream({ client, name, ephemeral: false });

    client2 = connect();
    stream2 = await cstream({
      client: client2,
      name,
      ephemeral: false,
      noCache: true,
    });
  });

  it("writes to key:value and confirms it was written", async () => {
    await stream.setKv("key", "value");
    expect(await stream.getKv("key")).toEqual("value");
    await wait({ until: () => stream2.getKv("key") == "value" });

    // also use an empty '' key
    const n = stream.length;
    await stream.setKv("", "a value");
    await wait({ until: () => stream.length > n });
    expect(await stream.getKv("")).toEqual("a value");
    await wait({ until: () => stream2.getKv("") == "a value" });
  });

  it("deletes the key and confirms it was deleted", async () => {
    await stream.deleteKv("key");
    await wait({ until: () => stream.getKv("key") === undefined });
    await wait({ until: () => stream2.getKv("key") === undefined });
  });

  it("also delete the empty key one", async () => {
    await stream2.deleteKv("");
    await wait({ until: async () => (await stream2.getKv("")) == undefined });
    expect(await stream2.getKv("")).toEqual(undefined);
    await wait({ until: () => stream.getKv("") === undefined });
  });

  it("delete a key that doesn't exist -- a no-op (shouldn't make sequence longer)", async () => {
    const n = stream.length;
    await stream.deleteKv("fake");
    expect(stream.length).toBe(n);
  });

  it("cleans up", () => {
    stream.close();
    stream2.close();
    client.close();
    client2.close();
  });
});

describe("test previousSeq when setting keys, which can be used to ensure consistent read/writes", () => {
  let client;
  let stream;
  let name = "prev";

  it("creates persistent stream", async () => {
    client = connect();
    stream = await cstream({ client, name, ephemeral: false });
  });

  let seq;
  it("sets a value", async () => {
    const { seq: seq0 } = await stream.setKv("my", "value");
    expect(seq0).toBeGreaterThan(0);
    seq = seq0;
  });

  it("tries to change the value using the wrong previousSeq", async () => {
    await expect(async () => {
      await stream.setKv("my", "newval", { previousSeq: 0 });
    }).rejects.toThrow("wrong last sequence");
  });

  it("changes the value using the correct previousSeq", async () => {
    const { seq: seq1 } = await stream.setKv("my", "newval", {
      previousSeq: seq,
    });
    await wait({ until: () => stream.seqKv("my") == seq1 });
    expect(stream.getKv("my")).toBe("newval");
    expect(stream.seqKv("my")).toBe(seq1);
  });

  it("previousSeq is ignored with non-key sets", async () => {
    const n = stream.length;
    await stream.publish("stuff", { previousSeq: 0 });
    await wait({ until: () => stream.length > n });
    expect(stream.get(stream.length - 1)).toBe("stuff");
  });
});

describe("test msgID dedup", () => {
  let client;
  let stream;
  let name = "msgid";
  let client2;
  let stream2;

  it("creates two clients", async () => {
    client = connect();
    stream = await cstream({ client, name, ephemeral: false });

    client2 = connect();
    stream2 = await cstream({
      client: client2,
      name,
      ephemeral: false,
      noCache: true,
    });

    expect(stream === stream2).toBe(false);
  });

  it("publishes a message with msgID twice and sees it only appears once", async () => {
    await stream.publish("x", { msgID: "myid" });
    await stream.publish("y", { msgID: "myid2" });
    await stream.publish("x", { msgID: "myid" });
    await wait({ until: () => stream.length == 2 });
    expect(stream.getAll()).toEqual(["x", "y"]);
    await wait({ until: () => stream2.length == 2 });
    expect(stream2.getAll()).toEqual(["x", "y"]);
    expect(stream.msgIDs.has("myid")).toBe(true);
  });

  it("publishes same message from other stream doesn't cause it to appear again either (so msgID check is server side)", async () => {
    // not just using local info and not accidentally the same object:
    expect(stream2.msgIDs.has("myid")).toBe(false);
    await stream2.publish("x", { msgID: "myid" });
    expect(stream2.getAll()).toEqual(["x", "y"]);
    await stream2.publish("y", { msgID: "myid2" });
    expect(stream2.getAll()).toEqual(["x", "y"]);
  });
});

import { disablePermissionCheck } from "@cocalc/conat/persist/client";

describe("test permissions", () => {
  it("create a CoreStream, but change the path to one that wouldn't be allowed given the subject", async () => {
    const client = connect();
    const stream: any = new CoreStream({
      client,
      name: "conat.ipynb",
      project_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(stream.storage.path).toBe(
      "projects/00000000-0000-4000-8000-000000000000/conat.ipynb",
    );
    expect(stream.user).toEqual({
      project_id: "00000000-0000-4000-8000-000000000000",
    });

    // now change it to something invalid by directly editing it
    stream.storage.path = "hub/conat.ipynb";

    // When we try to init, it must fail because the subject we use
    // for our location (the 'user', defined by
    // project_id: "00000000-0000-4000-8000-000000000000"
    // above) doesn't give permissions to hub/.
    // NOTE: even if a browser client is accessing a project resource
    // they give the project_id, not their id.
    await expect(async () => {
      await stream.init();
    }).rejects.toThrow("permission denied");

    stream.close();
  });

  it("do the tests again, but with the client side permission check disabled, to make sure the server denies us", async () => {
    disablePermissionCheck();
    const client = connect();
    let stream: any = new CoreStream({
      client,
      name: "conat2.ipynb",
      project_id: "00000000-0000-4000-8000-000000000000",
    });
    const origPath = stream.storage.path;
    stream.storage.path = "hub/conat2.ipynb";
    await expect(async () => {
      await stream.init();
    }).rejects.toThrow("permission denied");
    stream.close();

    stream = new CoreStream({
      client,
      name: "conat2.ipynb",
      project_id: "00000000-0000-4000-8000-000000000000",
    });
    // instead change the user and make sure denied
    stream.storage.path = origPath;
    // wrong project
    stream.user = { project_id: "00000000-0000-4000-8000-000000000004" };
    await expect(async () => {
      await stream.init();
    }).rejects.toThrow("permission denied");
    stream.close();

    stream = new CoreStream({
      client,
      name: "conat2.ipynb",
      project_id: "00000000-0000-4000-8000-000000000000",
    });
    stream.storage.path = origPath;
    // wrong user type
    stream.user = { account_id: "00000000-0000-4000-8000-000000000000" };
    await expect(async () => {
      await stream.init();
    }).rejects.toThrow("permission denied");

    stream.close();
  });
});

describe("test creating and closing a core-stream doesn't leak subscriptions", () => {
  let client;
  let stream;
  let name = "sub.count";
  let subs;

  it("make a new client and count subscriptions", async () => {
    client = connect();
    await once(client, "connected");
    await client.getInbox();
    subs = client.numSubscriptions();
    expect(subs).toBe(1); // the inbox
  });

  it("creates persistent stream", async () => {
    stream = await cstream({ client, name, ephemeral: false });
    await stream.setKv("my", "value");
    expect(client.numSubscriptions()).toBe(2);
  });

  it("close the stream and confirm subs returns to 1", async () => {
    stream.close();
    await expect(() => {
      client.numSubscriptions() == 1;
    });
  });
});

afterAll(after);
