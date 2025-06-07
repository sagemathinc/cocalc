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
  setDefaultTimeouts({ request: 750, publish: 750 });
});

jest.setTimeout(10000);

describe("create a client and server and socket, verify it works, restart conat server, then confirm that socket still works", () => {
  let client,
    server,
    cn1,
    cn2,
    sockets: any[] = [];
  it("creates the client and server and confirms it works", async () => {
    cn1 = connect();
    server = cn1.socket.listen("cocalc");
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
    client = cn2.socket.connect("cocalc");
    const resp = once(client, "data");
    client.write("cocalc");
    const [data] = await resp;
    expect(data).toBe("cocalccocalc");
    expect((await client.request(null)).data).toBe("hello");
  });

  async function waitForClientsToReconnect() {
    await Promise.all([once(cn1, "connected"), once(cn2, "connected")]);
    await cn1.syncSubscriptions();
    await cn2.syncSubscriptions();
  }

  let socketDisconnects: string[] = [];
  it("restarts conat and observes clients both disconnect and connect", async () => {
    client.on("disconnected", () => socketDisconnects.push("disconnected"));
    server.on("disconnected", () => socketDisconnects.push("disconnected"));
    await restartServer();
    await waitForClientsToReconnect();
  });

  it("restarts the conat socketio server, wait for clients to reconnect, and test sending data over socket", async () => {
    await restartServer();
    await waitForClientsToReconnect();
    // sending data over socket
    client.write("test");
    const resp = once(client, "data");
    const [data] = await resp;
    expect(data).toBe("testtest");
  });

  it("restart conat, wait for reconnect and observe request/respond immediately works", async () => {
    await restartServer();
    await waitForClientsToReconnect();
    expect((await client.request(null)).data).toBe("hello");
  });

  it("observes the socket did not disconnect - they never do until a timeout, being explicitly closed, which is the point of sockets", async () => {
    expect(socketDisconnects.length).toBe(0);
  });

  // this test should take 1-2 seconds due to having to missed-packet detection logic
  it("restart connection and have dropped message get through automatically without having to send another message or wait for reconnect", async () => {
    const iter = client.iter();
    client.write("cocalc");
    await restartServer();
    const { value } = await iter.next();
    expect(value[0]).toBe("cocalccocalc");
  });

  // this test should take 1-2 seconds due to having to missed-packet detection logic
  it("there must be no data loss and messages must be received in ORDER, even if we send data before or while reconnecting", async () => {
    const iter = client.iter();
    client.write("cocalc");
    await restartServer();

    // write another message to socket to cause out of order message deliver
    // to the other end
    client.write("foo");
    const { value } = await iter.next();
    expect(value[0]).toBe("cocalccocalc");

    // also checking ordering is correct too:
    const { value: value1 } = await iter.next();
    expect(value1[0]).toBe("foofoo");
  });

  // this test should take 1-2 seconds due to having to missed-packet detection logic
  it("restart connection as we are sending data from the server to the client, and see again that nothing is lost - this the other direction of the previous tests", async () => {
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

afterAll(after);
