/*
DEVELOPMENT:


   pnpm test ./core-stream-ephemeral.test.ts

*/

import { connect, before, after } from "@cocalc/backend/conat/test/setup";
import {
  cstream,
  COCALC_STREAM_HEADER,
  type CoreStream,
} from "@cocalc/conat/sync/core-stream";
import { wait } from "@cocalc/backend/conat/test/util";
import type { Client } from "@cocalc/conat/core/client";
import { is_date as isDate } from "@cocalc/util/misc";
import { dstream } from "@cocalc/conat/sync/dstream";

beforeAll(before);

describe("create a client, create an ephemeral leader core-stream, and do basic tests involving just this leader", () => {
  let client;
  let stream;
  let name = `test-${Math.random()}`;

  it("creates ephemeral core stream", async () => {
    client = connect();
    stream = await cstream({ client, name, persist: false, leader: true });
    expect(stream.length).toBe(0);
    expect(stream.leader).toBe(true);
    expect(stream.start_seq).toBe(undefined);
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
      name,
      persist: false,
      leader: false,
    });
    await wait({ until: () => stream2.length == 3 });
    expect(stream2.getAll()).toEqual(stream.getAll());
  });

  it("close and create and see that it's ephemeral", async () => {
    stream.close();
    stream = await cstream({ client, name, persist: false, leader: true });
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
    // streams also have an internalheader
    expect(headers[COCALC_STREAM_HEADER].seq).toBe(101);
    expect(typeof headers[COCALC_STREAM_HEADER].timestamp).toBe("number");
    expect(typeof headers[COCALC_STREAM_HEADER].sessionId).toBe("string");
    expect(stream.time(stream.length - 1)).toEqual(
      new Date(headers[COCALC_STREAM_HEADER].timestamp),
    );
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

  it("enforce limits doesn't crash (not much of a test as we didn't set any limits)", async () => {
    await stream.enforceLimitsNow();
  });

  it("purge the stream", async () => {
    await stream.purge();
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

describe("create three clients, create a leader core ephemeral stream with one client and two non-leader core ephemeral streams with the other two clients, then observe basic sync operations work", () => {
  const clients: Client[] = [];
  const streams: CoreStream[] = [];
  let name = `test-${Math.random()}`;

  it("creates clients and 3 ephemeral core streams -- one a leader and two followers", async () => {
    for (let i = 0; i < 4; i++) {
      clients.push(connect());
    }
    streams.push(
      await cstream({ client: clients[0], name, persist: false, leader: true }),
    );
    for (let i = 1; i < 3; i++) {
      streams.push(
        await cstream({
          client: clients[i],
          name,
          persist: false,
          leader: false,
        }),
      );
    }
    expect(streams[0].length).toBe(0);
    // @ts-ignore
    expect(streams[0].leader).toBe(true);
    expect(streams[1].length).toBe(0);
    // @ts-ignore
    expect(streams[1].leader).toBe(false);
    expect(streams[2].length).toBe(0);
    // @ts-ignore
    expect(streams[2].leader).toBe(false);
  });

  it("writes to leader stream and sees change reflected in the other 2", async () => {
    await streams[0].publish("hello");
    expect(streams[0].length).toBe(1);
    await wait({ until: () => streams[1].length > 0 && streams[2].length > 0 });
    expect(streams[1].length).toBe(1);
    expect(streams[2].length).toBe(1);
    for (let i = 0; i < 3; i++) {
      expect(streams[i].get(0)).toBe("hello");
    }
  });

  it("writes to non-leader stream and sees change reflected in the other 2", async () => {
    await streams[1].publish("conat");
    expect(streams[1].length).toBe(2);
    await wait({ until: () => streams[0].length > 1 && streams[2].length > 1 });
    expect(streams[0].length).toBe(2);
    expect(streams[2].length).toBe(2);
    for (let i = 0; i < 3; i++) {
      expect(streams[i].get(1)).toBe("conat");
    }
  });

  it("add a new non-leader stream and confirm it is initialized correctly and works", async () => {
    streams.push(
      await cstream({
        client: clients[3],
        name,
        persist: false,
        leader: false,
      }),
    );
    expect(streams[3].getAll()).toEqual(["hello", "conat"]);

    await streams[3].publish({ a: "stream" });
    await wait({ until: () => streams[0].length > 2 && streams[1].length > 2 });
    for (let i = 0; i < 4; i++) {
      expect(streams[i].get(2)).toEqual({ a: "stream" });
    }
  });

  it("cleans up", () => {
    for (let i = 0; i < 4; i++) {
      streams[i].close();
      clients[i].close();
    }
  });
});

describe("test creating a non-leader first, then the leader", () => {
  const clients: Client[] = [];
  const streams: (CoreStream | null)[] = [null, null];
  let name = `test-${Math.random()}`;

  it("creates 2 clients, then a follower, then the leader ", async () => {
    clients.push(connect());
    clients.push(connect());

    const createFollower = async () => {
      streams[0] = await cstream({
        client: clients[0],
        name,
        persist: false,
        leader: false,
      });
      await streams[0].publish("before");
    };
    createFollower();

    // now follower is being created, but should be stuck waiting for the leader

    streams[1] = await cstream({
      client: clients[1],
      name,
      persist: false,
      leader: true,
    });

    await wait({
      until: () =>
        (streams[0]?.length ?? 0) > 0 && (streams[1]?.length ?? 0) > 0,
    });
    expect(streams[1].getAll()).toEqual(["before"]);
    expect(streams[0]?.getAll()).toEqual(["before"]);
  });

  it("cleans up", () => {
    for (let i = 2; i < 2; i++) {
      streams[i]?.close();
      clients[i]?.close();
    }
  });
});

// There a lot more similar tests of dstream ephemeral in backend/conat/test/sync/dstream-ephemeral.test.ts
describe("test using ephemeral dstream", () => {
  let client;
  let stream;
  let name = `test-${Math.random()}`;

  it("creates an ephemeral dstream", async () => {
    client = connect();
    stream = await dstream({ client, name, ephemeral: true, leader: true });
    expect(stream.length).toBe(0);
  });

  it("publishes a value", () => {
    stream.publish(0);
    expect(stream.getAll()).toEqual([0]);
  });

  // [ ] TODO: this is be fast even for count=10000,
  // but it is NOT. We use a smaller value for now.
  const count = 100;
  it(`publish ${count} messages`, async () => {
    const v: number[] = [0];
    for (let i = 1; i < count; i++) {
      stream.publish(i);
      v.push(i);
      expect(stream.get(i)).toBe(i);
      expect(stream.length).toBe(i + 1);
    }
    expect(stream.length).toBe(count);
    expect(stream.getAll()).toEqual(v);
    await stream.save();
  });

  let client2;
  let stream2;
  it("opens a second dstream non-leader", async () => {
    client2 = connect();
    stream2 = await dstream({
      client: client2,
      name,
      ephemeral: true,
      leader: true,
    });
    expect(stream2.length).toBe(count);
  });

  it("write to the second stream and see reflected in the first", async () => {
    await stream2.publish("x");
    wait({ until: () => stream.length == 101 });
    expect(stream.get(stream.length - 1)).toBe("x");
  });
});

describe("test basic key:value functionality for persistent core stream", () => {
  let client;
  let stream;
  let name = "kv0";

  it("creates persistent core stream", async () => {
    client = connect();
    stream = await cstream({ client, name, persist: true });
    expect(stream.length).toBe(0);
    expect(stream.start_seq).toBe(undefined);
  });

  let seq;

  it("writes a key:value and confirms it was written", async () => {
    await stream.publish("value", { key: "key" });
    expect(await stream.kvGet("key")).toEqual("value");
    seq = stream.kvSeq("key");
  });

  it("closes and reopens stream, to confirm the key was persisted", async () => {
    stream.close();
    expect(stream.kv).toBe(undefined);
    stream = await cstream({ client, name, persist: true });
    expect(stream.length).toBe(1);
    expect(await stream.kvGet("key")).toEqual("value");
    expect(stream.kvSeq("key")).toBe(seq);
  });

  // it("call the other kv functions", async () => {});

  it("cleans up", () => {
    client.close();
    stream.close();
  });
});

// TODO ephemeral kv store

afterAll(after);
