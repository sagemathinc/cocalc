/*
Testing that core-stream works even with attempts to break it:

- by stopping/starting the persist server at key moments.

pnpm test ./core-stream-break.test.ts

*/

import { server as initPersistServer } from "@cocalc/backend/conat/persist";
import { dstream } from "@cocalc/backend/conat/sync";
import { cstream } from "@cocalc/conat/sync/core-stream";
import {
  connect,
  before,
  after,
  wait,
  delay,
  persistServer as setupPersistServer,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("stop persist server, create a client, create an ephemeral core-stream, then start persist server", () => {
  let client;
  let stream;
  let pclient;
  let persistServer;

  it("close the persist server that was setup as part of before above", async () => {
    await setupPersistServer.end();
  });

  it("start persist server, then create ephemeral core stream (verifying that persist server can be stopped then started and it works)", async () => {
    pclient = connect();
    client = connect();
    persistServer = initPersistServer({ client: pclient });
    stream = await cstream({ client, name: "test1" });
    expect(stream.length).toBe(0);
    await stream.publish("x");
    stream.close();
  });

  it("stops persist server again, but this time starts creating csteam before starting persist server", async () => {
    await persistServer.end({ timeout: 500 });
    stream = null;
    (async () => {
      stream = await cstream({ client, name: "test1" });
    })();
    await delay(50);
    persistServer = initPersistServer({ client: pclient });
    await wait({ until: () => stream != null });
    expect(stream.length).toBe(1);
    expect(stream.get(0)).toBe("x");
  });

  it("stops persist server again, and sees that publishing throws timeout error (otherwise it queues things up waiting for persist server to return)", async () => {
    await persistServer.end();

    await expect(async () => {
      await stream.publish("y", { timeout: 100 });
    }).rejects.toThrowError("no subscribers");

    try {
      await stream.publish("y", { timeout: 100 });
    } catch (err) {
      expect(`${err}`).toContain("timeout");
    }
  });

  it("starts persist server and can publish again", async () => {
    persistServer = initPersistServer({ client: pclient });
    await stream.publish("y");
  });

  it("creates a dstream, publishes, sees it hasn't saved, starts persist server and sees save works again", async () => {
    const d = await dstream({ name: "test2" });
    await persistServer.end({ timeout: 500 });
    d.publish("x");
    expect(d.hasUnsavedChanges()).toBe(true);
    persistServer = initPersistServer({ client: pclient });
    await d.save();
    expect(d.hasUnsavedChanges()).toBe(false);
    d.close();
  });

  it("terminates persist server and verifies can still creates a dstream, after starting the persist server", async () => {
    await persistServer.end();
    let d;
    stream = null;
    (async () => {
      d = await dstream({ client, name: "test2" });
    })();
    persistServer = initPersistServer({ client: pclient });
    await wait({ until: () => d != null });
    expect(d.get(0)).toBe("x");
    persistServer.close();
  });
});

afterAll(after);
