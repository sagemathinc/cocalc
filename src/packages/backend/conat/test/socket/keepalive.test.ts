/*
pnpm test ./keepalive.test.ts
*/

import { before, after, connect, wait } from "@cocalc/backend/conat/test/setup";
import { delay } from "awaiting";

beforeAll(before);

describe("test a server with a short keepalive time", () => {
  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [];

  const keepAlive = 100;
  const keepAliveTimeout = 50;

  it("creates a socket server with very short keepalive", async () => {
    cn1 = connect();
    server = cn1.socket.listen("keepalive-server.com", {
      keepAlive,
      keepAliveTimeout,
    });
    server.on("connection", (socket) => {
      sockets.push(socket);
    });
    expect(server.keepAlive).toBe(keepAlive);
    expect(server.keepAliveTimeout).toBe(keepAliveTimeout);
    cn2 = connect();
    client = cn2.socket.connect("keepalive-server.com", {
      keepAlive: 10000,
      keepAliveTimeout: 10000,
      reconnection: false,
    });
  });

  it("waits twice the keepAlive time and observes time gets updated and sockets alive", async () => {
    await delay(2 * keepAlive);
    await wait({ until: () => sockets[0].state == "ready" });
    expect(sockets[0].state).toBe("ready");
    expect(Math.abs(sockets[0].alive.last - Date.now())).toBeLessThan(
      1.2 * (keepAlive + keepAliveTimeout),
    );
  });

  it("breaks the client side of the socket and observes the server automatically disconnects", async () => {
    client.sub.close();
    await wait({ until: () => sockets[0].state == "closed" });
    expect(sockets[0].state).toBe("closed");
  });
});

describe("test a client with a short keepalive time", () => {
  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [];

  const keepAlive = 100;
  const keepAliveTimeout = 50;

  it("creates a socket server with long keepalive and client with a very short one", async () => {
    cn1 = connect();
    server = cn1.socket.listen("keepalive-client.com", {
      keepAlive: 10000,
      keepAliveTimeout: 10000,
    });
    server.on("connection", (socket) => {
      sockets.push(socket);
    });
    cn2 = connect();
    client = cn2.socket.connect("keepalive-client.com", {
      keepAlive,
      keepAliveTimeout,
      reconnection: false,
    });
    expect(client.keepAlive).toBe(keepAlive);
    expect(client.keepAliveTimeout).toBe(keepAliveTimeout);
  });

  it("waits several times the keepAlive time and observes time was updated and sockets still alive", async () => {
    await delay(2 * keepAlive);
    await wait({
      until: () => client.state == "ready",
    });
    expect(client.state).toBe("ready");
    expect(Math.abs(client.alive.last - Date.now())).toBeLessThan(
      keepAlive + keepAliveTimeout + 200,
    );
  });

  it("breaks the server side of the socket and observes the client automatically disconnects quickly", async () => {
    // hack to make server /dev/null any command from client
    server.handleCommandFromClient = () => {};
    await wait({ until: () => client.state == "disconnected" });
    expect(client.state).toBe("disconnected");
  });
});

afterAll(after);
