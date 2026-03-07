/*
pnpm test ./core-stream-recovery.test.ts
*/

import {
  before,
  after,
  connect,
  restartPersistServer,
  wait,
} from "@cocalc/backend/conat/test/setup";
import { cstream } from "@cocalc/conat/sync/core-stream";

beforeAll(before);

describe("core-stream recovery reuses a single changefeed iterator", () => {
  let client;
  let stream;
  let initialIter;

  it("creates a core stream and waits for the initial changefeed iterator", async () => {
    client = connect();
    stream = await cstream({
      client,
      name: `recovery-${Math.random()}`,
      noCache: true,
    });
    await wait({
      until: () => (stream as any).persistClient?.changefeeds?.length === 1,
    });
    initialIter = (stream as any).persistClient.changefeeds[0];
    expect((stream as any).persistClient.changefeeds.length).toBe(1);
  });

  it("restarts persist and confirms recovery does not create another iterator", async () => {
    await restartPersistServer();
    await wait({
      timeout: 15_000,
      until: async () => {
        try {
          await stream.publish("after-restart", { timeout: 500 });
          return (stream as any).persistClient?.changefeeds?.length === 1;
        } catch {
          return false;
        }
      },
    });
    expect((stream as any).persistClient.changefeeds.length).toBe(1);
    expect((stream as any).persistClient.changefeeds[0]).toBe(initialIter);
  });

  it("restarts persist again and still keeps just one iterator", async () => {
    await restartPersistServer();
    await wait({
      timeout: 15_000,
      until: async () => {
        try {
          await stream.publish("after-second-restart", { timeout: 500 });
          return (stream as any).persistClient?.changefeeds?.length === 1;
        } catch {
          return false;
        }
      },
    });
    expect((stream as any).persistClient.changefeeds.length).toBe(1);
    expect((stream as any).persistClient.changefeeds[0]).toBe(initialIter);
  });

  it("cleans up", () => {
    stream.close();
    client.close();
  });
});

afterAll(after);
