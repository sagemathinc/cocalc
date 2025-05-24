/*
DEVELOPMENT:


   pnpm test ./core-stream.test.ts

*/

import { connect, before, after } from "@cocalc/backend/conat/test/setup";
import { cstream, KEY_GC_THRESH } from "@cocalc/conat/sync/core-stream";
import { wait } from "@cocalc/backend/conat/test/util";
import { is_date as isDate } from "@cocalc/util/misc";
import { delay } from "awaiting";

const EPHEMERAL_LIFETIME = 2000;

beforeAll(before);

describe("create a client, create an ephemeral core-stream, and do basic tests", () => {
  let client;
  let stream;
  let name = `test-${Math.random()}`;
  const opts = {
    name,
    ephemeral: true,
    connectionOptions: { lifetime: EPHEMERAL_LIFETIME },
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
    expect(stream.get(0)).toBe(null);
    expect(stream.length).toBe(1);

    // publish a Buffer stays a Buffer
    await stream.publish(Buffer.from("xyz"));
    expect(stream.get(1)).toEqual(Buffer.from("xyz"));
    expect(Buffer.isBuffer(stream.get(1))).toBe(true);
    expect(stream.length).toBe(2);

    // publish a Date stays a Date
    const now = new Date();
    await stream.publish(now);
    expect(stream.get(2)).toEqual(now);
    expect(isDate(stream.get(2))).toEqual(true);
    expect(stream.renewLoopParams.lifetime).toBe(EPHEMERAL_LIFETIME);
  });

  it("publishing undefined is not allowed", async () => {
    await expect(
      async () => await stream.publish(undefined),
    ).rejects.toThrowError("must not be 'undefined'");
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
    stream.close();
    await delay(EPHEMERAL_LIFETIME+500);
    stream = await cstream({ client, ...opts });
    expect(stream.length).toBe(0);
  });

  const count = 100;
  it(`publish ${count} messages and observe it works`, async () => {
    const v: number[] = [];
    for (let i = 0; i < 100; i++) {
      await stream.publish(i);
      v.push(i);
      expect(stream.get(i)).toBe(i);
      expect(stream.length).toBe(i + 1);
    }
    expect(stream.length).toBe(100);
    expect(stream.getAll()).toEqual(v);
  });

  it("publish a message with a header", async () => {
    await stream.publish("body", { headers: { foo: { 10: 5 } } });
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
    stream.close();
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
    stream.close();
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
    await stream.setKv("", "a value");
    expect(await stream.getKv("")).toEqual("a value");
    await wait({ until: () => stream2.getKv("") == "a value" });
  });

  it("deletes the key and confirms it was deleted", async () => {
    await stream.deleteKv("key");
    expect(await stream.getKv("key")).toEqual(undefined);
    await wait({ until: () => stream2.getKv("key") === undefined });
  });

  it("also delete the empty key one", async () => {
    await stream2.deleteKv("");
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
    }).rejects.toThrowError("wrong last sequence");
  });

  it("changes the value using the correct previousSeq", async () => {
    const { seq: seq1 } = await stream.setKv("my", "newval", {
      previousSeq: seq,
    });
    expect(stream.getKv("my")).toBe("newval");
    expect(stream.seqKv("my")).toBe(seq1);
  });

  it("previousSeq is ignored with non-key sets", async () => {
    await stream.publish("stuff", { previousSeq: 0 });
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

// TODO ephemeral kv store (not implemented yet!)

afterAll(after);
