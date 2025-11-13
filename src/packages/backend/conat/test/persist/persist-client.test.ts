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
import { delay } from "awaiting";

beforeAll(before);

jest.setTimeout(10000);
describe.only("create a persist client stream and test the basic operations", () => {
  let client, s1;

  it.only("creates a client and stream", () => {
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

  jest.setTimeout(10000);
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
    const { value: updates, done } = await cf.next();
    expect(done).toBe(false);
    expect(updates[0]).toEqual(
      expect.objectContaining({
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

    const { value: updates, done } = await cf.next();
    expect(done).toBe(false);
    expect(updates[0]).toEqual(
      expect.objectContaining({
        seq: 2,
        key: "test2",
        headers: { foo: "bar2" },
      }),
    );
    expect(updates[0].seq).toBe(2);
    expect(updates.length).toBe(1);
  });

  // this takes a while due to it having to deal with the network restart
  it("restart conat socketio server, and verify changefeed still works", async () => {
    // send one more
    await s2.set({
      key: "test3",
      messageData: messageData("data3", { headers: { foo: "bar3" } }),
    });
    try {
      await restartServer();
    } catch (err) {
      console.log("error restarting server ", err);
    }
    await wait({
      until: async () => {
        // this set is expected to fail while networking is restarting
        try {
          await s1.set({
            key: "test4",
            messageData: messageData("data4", { headers: { foo: "bar4" } }),
            timeout: 1000,
          });
          return true;
        } catch {
          return false;
        }
      },
      start: 500,
    });

    // all three updates must get through, and in the correct order
    const { value: updates0, done: done0 } = await cf.next();
    expect(done0).toBe(false);
    expect(updates0[0].seq).toBe(3);
    // its random whether or not test4 comes through as part of the
    // first group or not.  The ones sent when offline always come
    // together in a group.
    if (updates0.length >= 2) {
      expect(updates0[1].seq).toBe(4);
    } else {
      const { value: updates1 } = await cf.next();
      expect(updates1[0].seq).toBe(4);
    }
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

  it("changefeed still works after restarting persist server, though what gets received is somewhat random -- the persist server doesn't have its own state so can't guarantee continguous changefeeds when it restarts", async () => {
    await delay(1000);
    await s2.set({
      key: "test5",
      messageData: messageData("data5", { headers: { foo: "bar5" } }),
      timeout: 1000,
    });
    const { value: updates, done } = await cf.next();
    expect(done).toBe(false);
    // changefeed may or may not have dropped a message, depending on timing
    expect(updates[0].headers?.foo?.startsWith("bar")).toBe(true);
  });
});

afterAll(after);
