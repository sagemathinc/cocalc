import { getPort } from "@cocalc/server/conat/test/util";
import { initConatServer } from "@cocalc/server/conat/socketio";
import { connect } from "@cocalc/backend/conat/conat";
import { delay } from "awaiting";
import { wait } from "@cocalc/server/conat/test/util";

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

describe("create server after creating a subscription and publishing a message, and observe that it works and nothing is lost", () => {
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

  it("see both messages we sent before connecting arrive", async () => {
    const { value: mesg1 } = await sub.next();
    expect(mesg1.data).toBe("hello");
    const { value: mesg2 } = await sub.next();
    expect(mesg2.data).toBe("conat");
  });

  it("publish another message", async () => {
    const { bytes, count } = await cn.publish("xyz", "more");
    expect(count).toBe(1);
    expect(bytes).toBe(5);
  });

  it("clean up", () => {
    server.close();
    cn.close();
    sub.close();
  });
});
