/*
pnpm test ./connect.test.ts
*/

import { getPort } from "@cocalc/backend/conat/test/util";
import { initConatServer } from "@cocalc/backend/conat/test/setup";
import { connect } from "@cocalc/backend/conat/conat";
import { delay } from "awaiting";
import { wait } from "@cocalc/backend/conat/test/util";

const path = "/conat";
let port;
beforeAll(async () => {
  port = await getPort();
});

describe("create server *after* client and ensure connects properly", () => {
  let cn;
  it("starts a client connecting to that port, despite there being no server yet", async () => {
    cn = connect(`http://localhost:${port}`, {
      path,
      reconnectionDelay: 25, // fast for tests
      randomizationFactor: 0,
    });
    await delay(20);
    expect(cn.conn.connected).toBe(false);
  });

  let server;
  it("create a server", async () => {
    server = await initConatServer({ port, path });
  });

  it("now client should connect", async () => {
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
  });

  it("close server and observe client disconnect", async () => {
    server.close();
    await wait({ until: () => !cn.conn.connected });
    expect(cn.conn.connected).toBe(false);
  });

  it("create server again and observe client connects again", async () => {
    server = await initConatServer({ port, path });
    await wait({ until: () => cn.conn.connected });
    expect(cn.conn.connected).toBe(true);
  });

  it("clean up", () => {
    server.close();
    cn.close();
  });
});

describe("create server after sync creating a subscription and publishing a message, and observe that messages are dropped", () => {
  let cn;
  it("starts a client, despite there being no server yet", async () => {
    cn = connect(`http://localhost:${port}`, { path });
    expect(cn.conn.connected).toBe(false);
  });

  let sub;
  it("create a subscription before the server exists", () => {
    sub = cn.subscribeSync("xyz");
    const { bytes } = cn.publishSync("xyz", "hello");
    expect(bytes).toBe(6);
    cn.publishSync("xyz", "conat");
  });

  let server;
  it("start the server", async () => {
    server = await initConatServer({ port, path });
    await wait({ until: () => cn.conn.connected });
  });

  it("see that both messages we sent before connecting were dropped", async () => {
    const { bytes, count } = await cn.publish("xyz", "more");
    expect(count).toBe(1);
    expect(bytes).toBe(5);
    const { value: mesg1 } = await sub.next();
    // we just got a message but it's AFTER the two above.
    expect(mesg1.data).toBe("more");
  });

  it("clean up", () => {
    server.close();
    cn.close();
    sub.close();
  });
});

describe("create server after async creating a subscription and async publishing a message, and observe that it DOES works", () => {
  let cn;
  it("starts a client, despite there being no server yet", async () => {
    cn = connect(`http://localhost:${port}`, { path });
    expect(cn.conn.connected).toBe(false);
  });

  let sub;
  let recv: any[] = [];
  it("create a sync subscription before the server exists", () => {
    const f = async () => {
      sub = await cn.subscribe("xyz");
      await cn.publish("xyz", "hello");
      const { value: mesg } = await sub.next();
      recv.push(mesg.data);
      await cn.publish("xyz", "conat");
      const { value: mesg2 } = await sub.next();
      recv.push(mesg2.data);
    };
    f();
  });

  let server;
  it("start the server", async () => {
    server = await initConatServer({ port, path });
    await wait({ until: () => cn.conn.connected });
  });

  it("see that both messages we sent before connecting arrive", async () => {
    await wait({ until: () => recv.length == 2 });
    expect(recv).toEqual(["hello", "conat"]);
  });

  it("clean up", () => {
    server.close();
    cn.close();
    sub.close();
  });
});
