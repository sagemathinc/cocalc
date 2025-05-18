/*
Very basic test of conats core client and server.
*/

import { connect, before, after } from "./setup";
import { wait } from "@cocalc/server/nats/test/util";

beforeAll(before);

describe("connect to the server from a client", () => {
  it("creates a client and confirm it connects", async () => {
    const cn = connect();
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
    cn.close();
    expect(cn.conn.connected).toBe(false);
  });

  it("creates a client and waits for the info field to get set", async () => {
    const cn = connect();
    await wait({ until: () => cn.info != null });
    expect(cn.info?.max_payload).toBeGreaterThan(10000);
  });
});

describe("basic test of publish and subscribe", () => {
  let sub;

  let subject = "conat";
  let cn;
  it("creates a subscription to 'conat'", async () => {
    cn = connect();
    sub = await cn.subscribe(subject);
  });

  it("publishes to 'conat' and verifies that the subscription receives the message", async () => {
    const data = "cocalc";
    await cn.publish(subject, data, { confirm: true });
    const { value, done } = await sub.next();
    expect(value.data).toEqual(data);
    expect(done).toBe(false);
  });

  it("publishes using a second client", async () => {
    const data = "client2";
    const cn2 = connect();
    expect(cn === cn2).toEqual(false);
    await cn2.publish(subject, data, { confirm: true });
    const { value } = await sub.next();
    expect(value.data).toEqual(data);
  });

  const count = 15;

  it(`publish ${count} messages and confirm receipt via sub.next`, async () => {
    for (let i = 0; i < count; i++) {
      cn.publish(subject, i);
    }
    for (let i = 0; i < count; i++) {
      const { value } = await sub.next();
      expect(value.data).toBe(i);
    }
  });

  it(`publish ${count} messages and confirm receipt via async iteration`, async () => {
    const w: number[] = [];
    for (let i = 0; i < count; i++) {
      cn.publish(subject, i);
      w.push(i);
    }
    const v: number[] = [];
    for await (const x of sub) {
      v.push(x.data);
      if (v.length == w.length) {
        break;
      }
    }
    expect(w).toEqual(v);
  });

  it("confirm existing the async iterator above ended the subscription", async () => {
    // this is how async iterators work...
    const { done } = await sub.next();
    expect(done).toBe(true);
  });

  it("make a new subscription, then stop subscription and confirm it ends", async () => {
    const sub2 = await cn.subscribe(subject);
    sub2.stop();
    const { value, done } = await sub.next();
    expect(value).toBe(undefined);
    expect(done).toBe(true);
  });

  // I'm unsure whether or not this is a good constraint.  It does make code simpler,
  // and massively protects against leaks.
  it("verify that you can't subscribe twice to the same subject with a single client", async () => {
    const sub1 = await cn.subscribe(subject);
    await expect(async () => {
      await cn.subscribe(subject);
    }).rejects.toThrowError("already subscribed");

    sub1.stop();
    // now this works
    const sub2 = await cn.subscribe(subject);
    sub2.stop();
  });
});

afterAll(after);
