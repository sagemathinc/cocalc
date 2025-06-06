/*
Very basic test of conat core client and server.

pnpm test ./basic.test.ts
*/

import { connect, before, after, wait } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("connect to the server from a client", () => {
  it("creates a client and confirm it connects", async () => {
    const cn = connect();
    expect(cn.conn.connected).toBe(false);
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
  let cn, cn2;
  it("creates a subscription to 'conat'", async () => {
    cn = connect();
    sub = await cn.subscribe(subject);
  });

  it("publishes to 'conat' and verifies that the subscription receives the message", async () => {
    const data = "cocalc";
    await cn.publish(subject, data);
    const { value, done } = await sub.next();
    expect(value.data).toEqual(data);
    expect(done).toBe(false);
  });

  it("publishes using a second client", async () => {
    const data = null;
    cn2 = connect();
    expect(cn === cn2).toEqual(false);
    await cn2.publish(subject, data);
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

  it("confirm exiting the async iterator above using break ended the subscription", async () => {
    // this is how async iterators work...
    const { done } = await sub.next();
    expect(done).toBe(true);
    expect(sub.ended).toBe(true);
  });

  it("we can now make a new subscription to the same subject.  We then stop the subscription and confirm it ends", async () => {
    const sub2 = await cn.subscribe(subject);
    sub2.stop();
    const { value, done } = await sub.next();
    expect(value).toBe(undefined);
    expect(done).toBe(true);
  });

  it("verify that you can't subscribe twice to the same subject with a single client but *different* queue groups", async () => {
    const sub1 = await cn.subscribe(subject);
    await expect(async () => {
      await cn.subscribe(subject, { queue: "xxx" });
    }).rejects.toThrowError("one queue group");

    sub1.stop();
    // now this works
    const sub2 = await cn.subscribe(subject);
    sub2.stop();
  });

  const subject2 = "foo.*.bar.>";
  it(`tests using the subject '${subject2}' with a wildcard and >`, async () => {
    const sub = await cn.subscribe(subject2);
    // this is ignored
    cn.publish("foo.x", "abc");
    // this is received
    cn.publish("foo.a.bar.b", "xxx", { headers: { a: "b" } });
    const { value: mesg } = await sub.next();
    expect(mesg.data).toBe("xxx");
    expect(mesg.headers).toEqual({ a: "b" });
    expect(mesg.subject).toBe("foo.a.bar.b");
  });

  it("queue groups -- same queue groups, so exactly one gets the message", async () => {
    const sub1 = await cn.subscribe("pub", { queue: "1" });
    const sub2 = await cn2.subscribe("pub", { queue: "1" });
    const { count } = await cn.publish("pub", "hello");
    expect(count).toBe(1);
    let count1 = 0;
    let count2 = 0;
    (async () => {
      await sub1.next();
      count1 += 1;
    })();
    (async () => {
      await sub2.next();
      count2 += 1;
    })();
    await wait({ until: () => count1 + count2 > 0 });
    expect(count1 + count2).toBe(1);
    sub1.stop();
    sub2.stop();
  });

  it("queue groups -- distinct queue groups ALL get the message", async () => {
    const sub1 = await cn.subscribe("pub3", { queue: "1" });
    const sub2 = await cn2.subscribe("pub3", { queue: "2" });
    const { count } = await cn.publish("pub3", "hello");
    expect(count).toBe(2);
    const { value: mesg1 } = await sub1.next();
    const { value: mesg2 } = await sub2.next();
    expect(mesg1.data).toBe("hello");
    expect(mesg2.data).toBe("hello");
  });
});

describe.only("basic tests of request/respond", () => {
  let c1, c2;

  it("create two clients", () => {
    c1 = connect();
    c2 = connect();
  });

  let sub;
  it("make one client be an eval server", async () => {
    sub = await c2.subscribe("eval");
    (async () => {
      for await (const mesg of sub) {
        mesg.respond(eval(mesg.data));
      }
    })();
  });

  it("send a request and gets a response", async () => {
    const resp = await c1.request("eval", "1+2+3+4+5+6+7+8+9+10");
    expect(resp.data).toBe(55);
  });

  it("'server' can also send a request and gets a response", async () => {
    const resp = await c2.request("eval", "1+2+3+4+5");
    expect(resp.data).toBe(15);
  });

  it("send a request to a server that doesn't exist and get 503 error", async () => {
    try {
      await c2.request("does-not-exist", "1+2+3+4+5");
    } catch (err) {
      expect(err.code == 503);
    }
  });

  it("stop our server above (close subscription) and confirm get 503 error", async () => {
    sub.close();
    await wait({
      until: async () => {
        try {
          await c1.request("eval", "1+2+3+4+5");
        } catch (err) {
          if (err.code == 503) {
            return true;
          }
        }
        return false;
      },
    });
  });

  let callIter;
  it("create a requestMany server that iterates over what you send it", async () => {
    // This example illustrates how to define a requestMany server
    // and includes error handling.  Note the technique of using
    // the *headers* for control signalling (e.g., when we're done, or if
    // there is an error) and using the message payload for the actual data.
    // In Conat headers are very well supported, encouraged, and easy to use
    // (and arbitrary JSON), unlike NATS.js.

    sub = await c2.subscribe("iter");
    (async () => {
      for await (const mesg of sub) {
        try {
          for (const x of mesg.data) {
            mesg.respond(x, { headers: { done: false } });
          }
          mesg.respond(null, { headers: { done: true } });
        } catch (err) {
          mesg.respond(null, { headers: { done: true, error: `${err}` } });
          return;
        }
      }
    })();

    // also function to do request
    callIter = async (client, x) => {
      const iter = await client.requestMany("iter", x);
      const v: any[] = [];
      for await (const resp of iter) {
        if (resp.headers?.error) {
          throw Error(resp.headers?.error);
        }
        if (resp.headers.done) {
          return v;
        }
        v.push(resp.data);
      }
      return v;
    };
  });

  it("call the iter server -- a simple test", async () => {
    const w = [3, 8, 9];
    const v = await callIter(c1, w);
    expect(v).toEqual(w);
    expect(v).not.toBe(w);

    // also from other client
    const v2 = await callIter(c2, w);
    expect(v2).toEqual(w);
  });

  it("call the iter server -- test that throws an error", async () => {
    await expect(async () => {
      await callIter(c1, null);
    }).rejects.toThrowError("is not iterable");
  });
});

describe("creating multiple subscriptions to the same subject", () => {
  let subject = "conat";
  let s1, s2;
  let c1, c2;
  it("creates clients and two subscriptions to same subject using the same client", async () => {
    c1 = connect();
    c2 = connect();
    s1 = await c1.subscribe(subject);
    s2 = await c1.subscribe(subject);
    expect(s1 === s2).toBe(false);
  });

  it("publishes to 'conat' and verifies that each subscription indendently receives each message", async () => {
    const data = "cocalc";
    await c2.publish(subject, data);
    const { value, done } = await s1.next();
    expect(value.data).toEqual(data);
    expect(done).toBe(false);
    const { value: value2, done: done2 } = await s2.next();
    expect(value2.data).toEqual(data);
    expect(done2).toBe(false);

    c2.publish(subject, 1);
    c2.publish(subject, 2);
    c2.publish(subject, 3);
    expect((await s1.next()).value.data).toBe(1);
    expect((await s2.next()).value.data).toBe(1);
    expect((await s1.next()).value.data).toBe(2);
    expect((await s1.next()).value.data).toBe(3);
    expect((await s2.next()).value.data).toBe(2);
    expect((await s2.next()).value.data).toBe(3);
  });

  it("closing properly reference counts", async () => {
    expect(c1.subs[subject].refCount).toBe(2);
    s1.close();
    expect(c1.subs[subject].refCount).toBe(1);
    expect(c1.queueGroups[subject] == null).toBe(false);
    c2.publish(subject, 4);
    expect((await s2.next()).value.data).toBe(4);
    s2.close();
    expect(c1.subs[subject]).toBe(undefined);
    expect(c1.queueGroups[subject]).toBe(undefined);
  });

  it("sync subscriptions also work", async () => {
    s1 = c1.subscribeSync(subject);
    s2 = c1.subscribeSync(subject);
    expect(s1 === s2).toBe(false);
    await c2.publish(subject, 5);
    expect((await s1.next()).value.data).toBe(5);
    expect((await s2.next()).value.data).toBe(5);
    s1.close();
    s2.close();
    expect(c1.subs[subject]).toBe(undefined);
  });
});

afterAll(after);
