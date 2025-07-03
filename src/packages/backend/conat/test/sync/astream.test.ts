/*
Testing basic ops with astream

DEVELOPMENT:

pnpm test ./astream.test.ts

*/

import { astream } from "@cocalc/backend/conat/sync";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { delay } from "awaiting";

beforeAll(before);

describe("test basics with an astream", () => {
  let client, s, s2;
  const name = "test-astream";

  it("creates the astream, then publish and read a value", async () => {
    client = connect();
    s = astream({ name, client });
    const { seq } = await s.publish("x");
    expect(seq).toBe(1);
    expect(await s.get(1)).toBe("x");
  });

  it("use a second astream", async () => {
    s2 = astream({ name, client, noCache: true });
    expect(await s2.get(1)).toBe("x");
    s2.close();
  });

  it("publish a message with a header", async () => {
    const { seq, time } = await s.publish("has a header", {
      headers: { foo: "bar" },
    });
    expect(await s.get(seq)).toBe("has a header");
    expect(await s.headers(seq)).toEqual(
      expect.objectContaining({ foo: "bar" }),
    );
    // note that seq and time are also in the header
    expect(await s.headers(seq)).toEqual({ foo: "bar", seq, time });
  });

  it("closes, then creates a new astream and sees data is there", async () => {
    await s.close();
    s = await astream({ name, client });
    expect(await s.get(1)).toBe("x");
  });

  it("get full message, which has both the data and the headers", async () => {
    const mesg = await s.getMessage(2);
    expect(mesg.data).toBe("has a header");
    expect(mesg.headers).toEqual(expect.objectContaining({ foo: "bar" }));
  });

  it("getAll messages", async () => {
    const x = await s.getAll();
    const { value } = await x.next();
    expect(value.mesg).toBe("x");
    expect(value.seq).toBe(1);
    expect(Math.abs(value.time - Date.now())).toBeLessThan(5000);
    const { value: value2 } = await x.next();
    expect(value2.mesg).toBe("has a header");
    expect(value2.headers).toEqual(expect.objectContaining({ foo: "bar" }));
    expect(value2.seq).toBe(2);
    expect(Math.abs(value2.time - Date.now())).toBeLessThan(5000);
    const { done } = await x.next();
    expect(done).toBe(true);
  });

  it("getAll messages starting from the second one", async () => {
    const x = await s.getAll({ start_seq: 2, end_seq: 2 });
    const { value } = await x.next();
    expect(value.mesg).toBe("has a header");
    expect(value.seq).toBe(2);
    const { done } = await x.next();
    expect(done).toBe(true);
  });

  it("getAll messages starting from the first and ending on the first", async () => {
    const x = await s.getAll({ start_seq: 1, end_seq: 1 });
    const { value } = await x.next();
    expect(value.mesg).toBe("x");
    expect(value.seq).toBe(1);
    const { done } = await x.next();
    expect(done).toBe(true);
  });

  it("cleans up", () => {
    s.close();
  });
});

const stress1 = 1e4;
describe(`stress test -- write, then read back, ${stress1} messages`, () => {
  let client, s;
  const name = "stress-test";

  it("creates the astream", async () => {
    client = connect();
    s = await astream({ name, client });
  });

  it(`publishes ${stress1} messages`, async () => {
    const v: number[] = [];
    for (let i = 0; i < stress1; i++) {
      v.push(i);
    }
    const z = await s.push(...v);
    expect(z.length).toBe(stress1);
  });

  it(`reads back ${stress1} messages`, async () => {
    const v: any[] = [];
    for await (const x of await s.getAll()) {
      v.push(x);
    }
    expect(v.length).toBe(stress1);
  });

  it("cleans up", () => {
    s.close();
  });
});

describe("test a changefeed", () => {
  let client, s, s2, cf, cf2, cf2b;
  const name = "test-astream";

  it("creates two astreams and three changefeeds on them", async () => {
    client = connect();
    s = astream({ name, client });
    cf = await s.changefeed();
    s2 = astream({ name, client, noCache: true });
    cf2 = await s2.changefeed();
    cf2b = await s2.changefeed();
  });

  it("writes to the stream and sees this in the changefeed", async () => {
    const first = cf.next();
    const first2 = cf2.next();
    const first2b = cf2b.next();
    await s.publish("hi");

    const { value, done } = await first;
    expect(done).toBe(false);

    expect(value.mesg).toBe("hi");
    const { value: value2 } = await first2;
    expect(value2.mesg).toBe("hi");
    const { value: value2b } = await first2b;
    expect(value2b.mesg).toBe("hi");
  });

  it("verify the three changefeeds are all distinct and do not interfere with each other", async () => {
    // write 2 messages and see they are received independently
    await s.publish("one");
    await s.publish("two");
    expect((await cf.next()).value.mesg).toBe("one");
    expect((await cf.next()).value.mesg).toBe("two");
    expect((await cf2.next()).value.mesg).toBe("one");
    expect((await cf2b.next()).value.mesg).toBe("one");
    expect((await cf2.next()).value.mesg).toBe("two");
    expect((await cf2b.next()).value.mesg).toBe("two");
  });

  const stress = 1000;
  it(`stress test -- write ${stress} values`, async () => {
    const v: number[] = [];
    for (let i = 0; i < stress; i++) {
      v.push(i);
    }
    const z = await s.push(...v);
    expect(z.length).toBe(v.length);
  });

  it(`stress test getting ${stress} values from a changefeed`, async () => {
    for (let i = 0; i < stress; i++) {
      await cf.next();
    }
  });

  it("cleans up", () => {
    s.close();
    s2.close();
  });
});

describe("test setting with key, ttl and msgID", () => {
  let client, s;
  const name = "test-astream-sets";

  it("creates the astream, then publish and read a value", async () => {
    client = connect();
    s = astream({ name, client });
    const { seq } = await s.publish("x", {
      key: "y",
      headers: { with: "key" },
    });
    expect(seq).toBe(1);
    expect(await s.get(1)).toBe("x");
    expect(await s.get("y")).toBe("x");
    expect(await s.headers("y")).toEqual(
      expect.objectContaining({ with: "key" }),
    );
  });

  it("publish a value with msgID twice and sees that it only appears once", async () => {
    const { seq } = await s.publish("foo", { msgID: "xx" });
    const { seq: seq2 } = await s.publish("foo", { msgID: "xx" });
    expect(seq).toEqual(seq2);
  });

  it("publish a value with ttl and sees it vanishes as expected", async () => {
    await s.config({ allow_msg_ttl: true });
    const { seq } = await s.publish("foo", { key: "i-have-ttl", ttl: 25 });
    expect(await s.get("i-have-ttl")).toBe("foo");
    await delay(50);
    // call config to force enforcing limits
    await s.config();
    expect(await s.get("i-have-ttl")).toBe(undefined);
    expect(await s.get(seq)).toBe(undefined);
  });

  it("cleans up", () => {
    s.close();
  });
});

afterAll(after);
