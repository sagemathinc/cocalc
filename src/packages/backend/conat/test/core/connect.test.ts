/*

pnpm test ./connect.test.ts

*/

import { getPort } from "@cocalc/backend/conat/test/util";
import {
  before,
  after,
  restartServer,
  connect,
  initConatServer,
} from "@cocalc/backend/conat/test/setup";
import { delay } from "awaiting";
import { wait } from "@cocalc/backend/conat/test/util";
import { once } from "@cocalc/util/async-utils";

let port;
beforeAll(async () => {
  await before();
  port = await getPort();
});

describe("basic test of restarting the server causing a reconnect of client", () => {
  let cn;
  it("starts a client connecting to that port, despite there being no server yet", async () => {
    cn = connect();
    expect(cn.conn.connected).toBe(false);
    expect(cn.state).toBe("disconnected");
  });

  it("now client should connect", async () => {
    const connected = once(cn, "connected");
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
    await connected; // verify connected event fired
    expect(cn.state).toBe("connected");
  });

  it("close server and observe client disconnects, then connects again", async () => {
    expect(cn.state).toBe("connected");
    restartServer();
    await once(cn, "disconnected");
    await once(cn, "connected");
  });

  it("clean up", () => {
    cn.close();
  });
});
describe("create server *after* client and ensure connects properly", () => {
  let cn;
  it("starts a client connecting to that port, despite there being no server yet", async () => {
    cn = connect({
      address: `http://localhost:${port}`,
      reconnectionDelay: 25, // fast for tests
      randomizationFactor: 0,
    });
    await delay(20);
    expect(cn.conn.connected).toBe(false);
    expect(cn.state).toBe("disconnected");
  });

  let server;
  it("create a server", async () => {
    server = await initConatServer({ port });
  });

  it("now client should connect", async () => {
    const connected = once(cn, "connected");
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
    await connected; // verify connected event fired
  });

  it("close server and observe client disconnect", async () => {
    const disconnected = once(cn, "disconnected");
    server.close();
    await wait({ until: () => !cn.conn.connected });
    expect(cn.conn.connected).toBe(false);
    await disconnected; // verify disconnected event fired
  });

  it("create server again and observe client connects again", async () => {
    const connected = once(cn, "connected");
    server = await initConatServer({ port });
    await wait({ until: () => cn.conn.connected });
    expect(cn.conn.connected).toBe(true);
    await connected; // verify connected event fired
  });

  it("clean up", () => {
    server.close();
    cn.close();
  });
});

describe("create server after sync creating a subscription and publishing a message, and observe that messages are dropped", () => {
  // The moral here is do NOT use subscribeSync and publishSync
  // unless you don't care very much...
  let cn;
  it("starts a client, despite there being no server yet", async () => {
    cn = connect({ address: `http://localhost:${port}` });
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
    server = await initConatServer({ port });
    await wait({ until: () => cn.conn.connected });
    await delay(50);
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
    cn = connect({ address: `http://localhost:${port}` });
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
    server = await initConatServer({ port });
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

afterAll(after);
