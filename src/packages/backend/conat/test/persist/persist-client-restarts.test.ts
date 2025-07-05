/*
Tests of persist client.

pnpm test ./persist-client-restarts.test.ts

*/

import {
  before,
  after,
  connect,
  restartServer,
  restartPersistServer,
  wait,
} from "@cocalc/backend/conat/test/setup";
import { stream } from "@cocalc/conat/persist/client";
import { messageData } from "@cocalc/conat/core/client";

beforeAll(before);

jest.setTimeout(15000);
describe("restarting the network and/or persist server, but with no delay afterwards", () => {
  let client, s1;

  it("creates a client, stream and test data", async () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/network" },
    });
    await s1.set({
      key: "test",
      messageData: messageData("data"),
    });
    const mesg = await s1.get({ key: "test" });
    expect(mesg.data).toBe("data");
  });

  it("restart conat networking", async () => {
    await restartServer();
  });

  it("it start working again after restart of socketio server only, though we expect some errors", async () => {
    try {
      await s1.get({ key: "test", timeout: 500 });
    } catch {}
    await wait({
      until: async () => {
        try {
          await s1.get({ key: "test", timeout: 500 });
          return true;
        } catch {
          return false;
        }
      },
    });
    const mesg = await s1.get({ key: "test" });
    expect(mesg.data).toBe("data");
  });

  it("restarts just persist server", () => {
    restartPersistServer();
  });

  it("it starts working again after restart after persist server only, though we expect some errors", async () => {
    await wait({
      until: async () => {
        try {
          await s1.set({
            key: "test-5",
            messageData: messageData("data", { headers: { foo: "bar" } }),
            timeout: 500,
          });
          return true;
        } catch (err) {
          return false;
        }
      },
    });
    const mesg = await s1.get({ key: "test-5" });
    expect(mesg.data).toBe("data");
  });

  it("restarts BOTH the socketio server and the persist server", () => {
    restartServer();
    restartPersistServer();
  });

  it("it starts working again after restart of BOTH servers, though we expect some errors", async () => {
    await wait({
      timeout: 15000,
      until: async () => {
        try {
          await s1.set({
            key: "test-10",
            messageData: messageData("data", { headers: { foo: "bar" } }),
            timeout: 500,
          });
          return true;
        } catch (err) {
          return false;
        }
      },
    });
    const mesg = await s1.get({ key: "test-10" });
    expect(mesg.data).toBe("data");
  });
});

afterAll(after);
