/*
Testing that core-stream works even with attempts to break it:

- by stopping/starting the persist server at key moments.

pnpm test ./core-stream-break.test.ts
*/

import {
  initServer as initPersistServer,
  terminateServer as terminatePersistServer,
} from "@cocalc/backend/conat/persist";
import { dstream } from "@cocalc/backend/conat/sync";
import { cstream } from "@cocalc/conat/sync/core-stream";
import {
  connect,
  before,
  after,
  wait,
  delay,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("stop persist server, create a client, create an ephemeral core-stream, then start persist server", () => {
  let client;
  let stream;
  let pclient;

  it("stop persist server", async () => {
    pclient = connect();
    await terminatePersistServer();
  });

  it("start persist server, then create ephemeral core stream (verifying that persist server can be stopped then started and it works)", async () => {
    client = connect();
    await initPersistServer({ client: pclient });
    stream = await cstream({ client, name: "test1" });
    expect(stream.length).toBe(0);
    await stream.publish("x");
    stream.close();
  });

  it("stops persist server again, but this time starts creating csteam before starting persist server", async () => {
    await terminatePersistServer();
    stream = null;
    (async () => {
      stream = await cstream({ client, name: "test1" });
    })();
    await delay(50);
    await initPersistServer({ client: pclient });
    await wait({ until: () => stream != null });
    expect(stream.length).toBe(1);
    expect(stream.get(0)).toBe("x");
  });

  it("stops persist server again, and sees that publishing throws 503 error", async () => {
    await terminatePersistServer();
    await expect(async () => {
      await stream.publish("y");
    }).rejects.toThrowError("no subscribers");
    try {
      await stream.publish("y");
    } catch (err) {
      expect(err.code).toBe(503);
    }
  });

  it("starts persist server and can publish again", async () => {
    await initPersistServer({ client: pclient });
    await stream.publish("y");
  });

  it("creates a dstream, publishes, sees it can't save, starts persist server and sees save works again", async () => {
    const d = await dstream({ name: "test2" });
    await terminatePersistServer();
    d.publish("x");
    expect(d.hasUnsavedChanges()).toBe(true);
    await initPersistServer({ client: pclient });
    await d.save();
    expect(d.hasUnsavedChanges()).toBe(false);
    d.close();
  });

  it("terminates persist server and verifies can still creates a dstream, after starting the persist server", async () => {
    await terminatePersistServer();
    let d;
    stream = null;
    (async () => {
      d = await dstream({ client, name: "test2" });
    })();
    await initPersistServer({ client: pclient });
    await wait({ until: () => d != null });
    expect(d.get(0)).toBe("x");
  });
});

afterAll(after);
