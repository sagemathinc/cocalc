/*

pnpm test `pwd`/restarts.test.ts

*/

import {
  before,
  after,
  connect,
  restartServer,
  setDefaultTimeouts,
} from "@cocalc/backend/conat/test/setup";
import { once } from "@cocalc/util/async-utils";

beforeAll(async () => {
  await before();
  setDefaultTimeouts({ request: 500, publish: 500 });
});

describe("create a client and server and socket, verify it works, restart conat server, then confirm that socket still works", () => {
  const SUBJECT = "reconnect.one";

  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [];

  it("creates the client and server and confirms it works", async () => {
    cn1 = connect();
    server = cn1.socket.listen(SUBJECT);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
      socket.on("request", (mesg) => {
        mesg.respond("hello");
      });
    });
    cn2 = connect();
    client = cn2.socket.connect(SUBJECT);

    const iter = client.iter();
    client.write("cocalc");
    const { value } = await iter.next();
    expect(value[0]).toBe("cocalccocalc");

    expect((await client.request(null)).data).toBe("hello");
  });

  async function waitForClientsToReconnect() {
    for (const client of [cn1, cn2]) {
      if (client.state != "connected") {
        await once(client, "connected");
      }
    }
  }

  it("restarts the conat socketio server, wait for clients to reconnect, and test sending data over socket", async () => {
    await restartServer();
    await waitForClientsToReconnect();
    // sending data over socket
    const iter = client.iter();
    client.write("test");
    const { value, done } = await iter.next();
    expect(done).toBe(false);
    expect(value[0]).toBe("testtest");
  });

  let socketDisconnects: string[] = [];
  it("also request/respond immediately works", async () => {
    expect((await client.request(null)).data).toBe("hello");
  });

  it("observes the socket did not disconnect - they never do until a timeout or being explicitly closed, which is the point of sockets -- they are robust to client connection state", async () => {
    expect(socketDisconnects.length).toBe(0);
  });

  // this test should take several seconds due to having to missed-packet detection logic
  it("restart connection right when message is being sent; dropped message eventually gets through automatically without waiting for reconnect", async () => {
    const iter = client.iter();
    client.write("conat ");
    await restartServer();
    const { value } = await iter.next();
    expect(value[0]).toBe("conat conat ");
  });

  it("cleans up", () => {
    cn1.close();
    cn2.close();
  });
});

describe("test of socket and restarting server -- restart while sending data from server to the client", () => {
  const SUBJECT = "reconnect.two";

  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [];

  it("creates the client and server and confirms it works", async () => {
    cn1 = connect();
    server = cn1.socket.listen(SUBJECT);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });
    cn2 = connect();
    client = cn2.socket.connect(SUBJECT);
    const iter = client.iter();
    client.write("cocalc");
    const { value } = await iter.next();
    expect(value[0]).toBe("cocalccocalc");
  });

  // this test should take several seconds due to having to missed-packet detection logic
  it("restart connection as we are sending data from the server to the client, and see again that nothing is lost - this the server --> client direction of the tests below which was client --> server", async () => {
    const socket = sockets[0];
    const iter = client.iter();
    socket.write("sneaky");
    await restartServer();
    const { value } = await iter.next();
    expect(value[0]).toBe("sneaky");
  });

  it("cleans up", () => {
    cn1.close();
    cn2.close();
  });
});

describe("another restart test: sending data while reconnecting to try to screw with order of arrival of messages", () => {
  const SUBJECT = "reconnect.three";

  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [],
    iter;
  it("creates the client and server and confirms it works", async () => {
    cn1 = connect();
    server = cn1.socket.listen(SUBJECT);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });
    cn2 = connect();
    client = cn2.socket.connect(SUBJECT);
    iter = client.iter();
    client.write("one ");
    const { value } = await iter.next();
    expect(value[0]).toBe("one one ");
  });

  it("now the **HARD CASE**; we do the same as above, but kill the server exactly as the message is being sent, so it is dropped", async () => {
    client.write("four ");
    await restartServer();

    // write another message to socket to cause out of order message deliver
    // to the other end
    client.write("five ");
    const { value } = await iter.next();
    expect(value[0]).toBe("four four ");

    // also checking ordering is correct too -- we next
    // next get the foofoo response;
    const { value: value1 } = await iter.next();
    expect(value1[0]).toBe("five five ");
  });

  it("cleans up", () => {
    cn1.close();
    cn2.close();
  });
});

afterAll(after);
