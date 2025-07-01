/*

pnpm test `pwd`/cluster.test.ts

*/

import {
  after,
  delay,
  before,
  server,
  addNodeToDefaultCluster,
  once,
} from "../setup";

beforeAll(before);

describe("creating sockets in a cluster", () => {
  let client0, server1, client1;
  it("creates 2 node another node", async () => {
    client0 = server.client();
    server1 = await addNodeToDefaultCluster();
    client1 = server1.client();
    expect(server1.clusterTopology()).toEqual(server.clusterTopology());
  });

  let socketServer, socketServer2;
  it("create socket with server in node0 and test connecting", async () => {
    socketServer = client0.socket.listen("foo.com.*");
    socketServer.on("connection", (socket) => {
      const x = socket.subject.split(".").slice(0, 3).join(".");
      socket.write(`hello from ${x}`);
    });
    socketServer2 = client0.socket.listen("cocalc.edu");
    socketServer2.on("connection", (socket) => {
      socket.write("hello from cocalc.edu");
    });
  });

  it("connects from client connected to node1", async () => {
    const conn = client0.socket.connect("foo.com.0");
    const [data] = await once(conn, "data");
    expect(data).toBe("hello from foo.com.0");
    conn.close();
    // ensure fully closed (better test of other what's below)
    await delay(250);
  });

  it("connects from client connected to node1 (do it again)", async () => {
    const conn = client1.socket.connect("cocalc.edu");
    const [data] = await once(conn, "data");
    expect(data).toBe("hello from cocalc.edu");
    conn.close();
  });

  it("connects from client connected to node1 (do it again, again)", async () => {
    const conn = client1.socket.connect("cocalc.edu");
    const [data] = await once(conn, "data");
    expect(data).toBe("hello from cocalc.edu");
    conn.close();
  });

  const count = 5;
  it(`creates ${count} sockets at once from client connected to node1`, async () => {
    const conns: any[] = [];
    for (let i = 0; i < count; i++) {
      const conn = client1.socket.connect(`foo.com.${i}`);
      conns.push(conn);
      const [data] = await once(conn, "data");
      expect(data).toBe(`hello from foo.com.${i}`);
    }
    for (const conn of conns) {
      conn.close();
    }
  });
});

afterAll(after);
