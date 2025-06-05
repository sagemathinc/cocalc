/*
Tests of persist client.

pnpm test ./persist-client.test.ts 

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

describe("create a persist client stream and test the basic operations", () => {
  let client, s1;

  it("creates a client and stream", () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
  });

  let seq0;
  it("write a value to the stream", async () => {
    const { seq, time } = await s1.set({
      messageData: messageData("hi", { headers: { foo: "bar" } }),
    });
    expect(Math.abs(time - Date.now())).toBeLessThan(1000);
    seq0 = seq;
  });

  it("get the value back", async () => {
    const mesg = await s1.get({ seq: seq0 });
    expect(mesg.data).toBe("hi");
    expect(mesg.headers.foo).toBe("bar");
  });

  it("writes a value with a key", async () => {
    await s1.set({
      key: "my-key",
      messageData: messageData("value", { headers: { foo: "bar" } }),
    });
    const mesg = await s1.get({ key: "my-key" });
    expect(mesg.data).toBe("value");
  });
});

describe("restarting persist server", () => {
  let client, s1;

  it("creates a client and stream and write test data", async () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/bar" },
    });
    await s1.set({
      key: "test",
      messageData: messageData("data", { headers: { foo: "bar" } }),
    });
  });

  it("restart the persist server", async () => {
    await restartPersistServer();
  });

  it("first attempt to read the data written above fails because persist server hasn't started yet", async () => {
    await expect(async () => {
      await s1.get({ key: "test", timeout: 500 });
    }).rejects.toThrow("no subscribers");
  });

  it("it does start working relatively quickly though", async () => {
    await wait({
      until: async () => {
        try {
          await s1.get({ key: "test", timeout: 1500 });
          return true;
        } catch {}
      },
    });

    const mesg = await s1.get({ key: "test" });
    expect(mesg.data).toBe("data");
  });
});

describe("restarting persist server with an ephemeral stream", () => {
  let client, s1;

  it("creates a client and an ephemeral stream and write test data", async () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/in-memory-only", ephemeral: true },
    });
    await s1.set({
      key: "test",
      messageData: messageData("data", { headers: { foo: "bar" } }),
    });
  });

  it("restart the persist server", async () => {
    await restartPersistServer();
  });

  it("our data is gone - it's ephemeral", async () => {
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/in-memory-onl", ephemeral: true },
    });
    await wait({
      until: async () => {
        try {
          const mesg = await s1.get({ key: "test", timeout: 500 });
          return mesg === undefined;
        } catch {}
      },
    });

    expect(await s1.get({ key: "test" })).toBe(undefined);
  });
});

describe("restarting the network but not the persist server", () => {
  let client, s1;

  it("creates a client and stream and write test data", async () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/network" },
    });
    await s1.set({
      key: "test",
      messageData: messageData("data", { headers: { foo: "bar" } }),
    });
  });

  it("restart conat networking", async () => {
    await restartServer();
  });

  it("it does start working eventually", async () => {
    await wait({
      until: async () => {
        try {
          await s1.get({ key: "test", timeout: 1000 });
          return true;
        } catch {}
      },
    });
    const mesg = await s1.get({ key: "test" });
    expect(mesg.data).toBe("data");
  });
});

describe("restarting the network but with no delay afterwards", () => {
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

  it("it start working again after restart, though we expect some errors", async () => {
    try {
      await s1.get({ key: "test", timeout: 500 });
    } catch (err) {
      expect(`${err}`).toMatch(/timeout|subscribers|disconnected/);
    }
    await wait({
      until: async () => {
        try {
          await s1.get({ key: "test", timeout: 1000 });
          return true;
        } catch {
          return false;
        }
      },
    });
    const mesg = await s1.get({ key: "test" });
    expect(mesg.data).toBe("data");
  });

  it("restarts BOTH the socketio conat server and the persist server", () => {
    restartServer();
    restartPersistServer();
  });

  it("it start working again after restart, though we expect some errors", async () => {
    await wait({
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

describe("test a changefeed", () => {
  let client, s1, cf;

  it("creates a client, stream and changefeed", async () => {
    client = connect();
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/changefeed" },
    });
    cf = await s1.changefeed();
  });

  it("write and see result via changefeed", async () => {
    await s1.set({
      key: "test",
      messageData: messageData("data", { headers: { foo: "bar" } }),
    });
    const { value, done } = await cf.next();
    expect(done).toBe(false);
    expect(value.seq).toBe(0);
    expect(value.updates[0]).toEqual(
      expect.objectContaining({
        op: "set",
        seq: 1,
        key: "test",
        headers: { foo: "bar" },
      }),
    );
  });

  let s2, client2;
  it("write via another client and see result via changefeed", async () => {
    client2 = connect();
    s2 = stream({
      client: client2,
      user: { hub_id: "x" },
      storage: { path: "hub/changefeed" },
    });
    expect(s1).not.toBe(s2);
    await s2.set({
      key: "test2",
      messageData: messageData("data2", { headers: { foo: "bar2" } }),
    });

    const { value, done } = await cf.next();
    expect(done).toBe(false);
    expect(value.seq).toBe(1);
    expect(value.updates[0]).toEqual(
      expect.objectContaining({
        op: "set",
        seq: 2,
        key: "test2",
        headers: { foo: "bar2" },
      }),
    );
  });

  it("restart the Conat network", async () => {
    await restartServer();
  });

  it("verify changefeed still works even after restarting network server", async () => {
    await wait({
      until: async () => {
        // this set is expected to fail while networking is restarting
        try {
          await s2.set({
            key: "test3",
            messageData: messageData("data3", { headers: { foo: "bar3" } }),
            timeout: 500,
          });
          return true;
        } catch {
          return false;
        }
      },
    });

    // the changefeed should still work and detect the above write, because
    // our sockets are robust.
    const { value, done } = await cf.next();
    expect(done).toBe(false);
    expect(value.updates[0]).toEqual(
      expect.objectContaining({
        op: "set",
        seq: 3,
        key: "test3",
        headers: { foo: "bar3" },
      }),
    );
  });

  it("restart the persist server -- this is pretty brutal", async () => {
    await restartPersistServer();
  });

  it("set still works (with error) after restarting persist server", async () => {
    // doing this set should fail due to persist for a second due server being
    // off and having to connect again.
    await wait({
      until: async () => {
        try {
          await s2.set({
            key: "test4",
            messageData: messageData("data4", { headers: { foo: "bar4" } }),
            timeout: 500,
          });

          return true;
        } catch {
          return false;
        }
      },
    });
    const mesg = await s2.get({ key: "test4" });
    expect(mesg.data).toBe("data4");
  });

  it("changefeed still works after restarting persist server", async () => {
    // the changefeed should still work and detect the above write, because
    // our sockets are robust.
    const { value, done } = await cf.next();
    expect(done).toBe(false);
    expect(value.updates[0]).toEqual(
      expect.objectContaining({
        op: "set",
        seq: 4,
        key: "test4",
        headers: { foo: "bar4" },
      }),
    );
  });
});

afterAll(after);
