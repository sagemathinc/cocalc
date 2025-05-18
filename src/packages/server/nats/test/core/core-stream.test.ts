import { connect, before, after } from "./setup";
import { cstream, COCALC_STREAM_HEADER } from "@cocalc/nats/sync/core-stream";

beforeAll(before);

describe("create a client, create an ephemeral leader core-stream, and do basic tests", () => {
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

  it("close and create and see that it's ephemeral", async () => {
    await stream.publish("hi");
    expect(stream.length).toBe(1);
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
  });
});

afterAll(after);
