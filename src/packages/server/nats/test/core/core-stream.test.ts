import { connect, before, after } from "./setup";
import { cstream } from "@cocalc/nats/sync/core-stream";

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
  });

  it("publish to the stream", async () => {
    await stream.publish("hi");
  });

  it.skip("close and create and see that it's ephemera", async () => {
    await stream.publish("hi");
    expect(stream.length).toBe(1);
    stream.close();
    stream = await cstream({ client, name, persist: false, leader: true });
    expect(stream.length).toBe(0);
  });

  it("clean up", () => {
    stream.close();
  });
});

afterAll(after);
