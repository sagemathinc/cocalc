/*
pnpm test ./subject-socket.test.ts
*/

import { before, after, connect, wait } from "@cocalc/backend/conat/test/setup";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

beforeAll(before);

describe("create a server and client, then send a message and get a response", () => {
  let client, server, cn1, cn2;
  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen("primus");
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });
  });

  it("connects as client and tests out the server", async () => {
    cn2 = connect();
    client = cn2.socket.connect("primus");
    client.write("cocalc");
    const [data] = await once(client, "data");
    expect(data).toBe("cocalccocalc");
  });

  it("send 3 messages and get 3 responses, in order", async () => {
    client.write("a");
    client.write("b");
    client.write("c");
    expect((await once(client, "data"))[0]).toBe("aa");
    expect((await once(client, "data"))[0]).toBe("bb");
    expect((await once(client, "data"))[0]).toBe("cc");
  });

  const count = 250;
  it(`sends ${count} messages and gets responses, so its obviously not super slow`, async () => {
    const t = Date.now();
    for (let i = 0; i < count; i++) {
      client.write(`${i}`);
    }
    for (let i = 0; i < count; i++) {
      expect((await once(client, "data"))[0]).toBe(`${i}`.repeat(2));
    }
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("create a client first, then the server, and see that it still works (testing the order); also include headers in both directions", () => {
  let client, server, cn1, cn2;

  it("connects as client and tests out the server", async () => {
    cn2 = connect();
    client = cn2.socket.connect("primus");
    client.write("cocalc", { my: "header" });
  });

  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen("primus");
    server.on("connection", (socket) => {
      socket.on("data", (data, headers) => {
        socket.write(`${data}`.repeat(2), headers);
      });
    });
  });

  it("it still works out", async () => {
    const [data, headers] = await once(client, "data");
    expect(data).toBe("cocalccocalc");
    expect(headers).toEqual({ my: "header" });
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("create a client first and writing more messages than the queue size results in dropped messages", () => {
  let client, server, cn1, cn2;

  let count = 5,
    maxQueueSize = 3;
  it("connects as client and tests out the server", async () => {
    cn2 = connect();
    client = cn2.socket.connect("primus", { maxQueueSize });
    for (let i = 0; i < count; i++) {
      client.write(`${i}`);
    }
    expect(client.queuedWrites.length).toBe(3);
  });

  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen("primus", { maxQueueSize });
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });
  });

  it(`only ${maxQueueSize} messages got through (some were dropped)`, async () => {
    for (let i = count - maxQueueSize; i < count; i++) {
      expect((await once(client, "data"))[0]).toBe(`${i}`.repeat(2));
    }
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("test having two clients and see that communication is independent and also broadcast to both", () => {
  let client1, client2, server, cn1, cn2, cn3;

  it("creates a server and two clients", async () => {
    cn3 = connect();
    server = cn3.socket.listen("primus2");
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });

    cn1 = connect();
    client1 = cn1.socket.connect("primus2");
    cn2 = connect();
    client2 = cn2.socket.connect("primus2");
  });

  it("each client uses the server separately", async () => {
    const x1 = once(client1, "data");
    const x2 = once(client2, "data");
    client1.write("one");
    client2.write("two");
    expect((await x1)[0]).toBe("oneone");
    expect((await x2)[0]).toBe("twotwo");
  });

  it("server broadcast to all clients", async () => {
    const x1 = once(client1, "data");
    const x2 = once(client2, "data");
    server.write("broadcast");
    expect((await x1)[0]).toBe("broadcast");
    expect((await x2)[0]).toBe("broadcast");
  });

  it("test with a channel", async () => {
    const s1 = server.channel("one");
    const c1 = client1.channel("one");
    const c2 = client2.channel("one");
    s1.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`1${data}`);
      });
    });
    const x1 = once(c1, "data");
    const x2 = once(c2, "data");
    c1.write("c1");
    expect((await x1)[0]).toBe("1c1");
    c2.write("c2");
    expect((await x2)[0]).toBe("1c2");

    s1.close();
    c1.close();
    c2.close();
  });

  it("cleans up", () => {
    client1.close();
    client2.close();
    server.close();
    cn1.close();
    cn2.close();
    cn3.close();
  });
});

describe("create a server and client. Disconnect the client and see from the server point of view that it disconnected.", () => {
  let server, cn1;

  it("creates the server", () => {
    cn1 = connect();
    server = cn1.socket.listen("subject");
    server.on("connection", (socket) => {
      socket.on("data", () => {
        socket.write(`clients=${Object.keys(server.sockets).length}`);
      });
    });
    expect(Object.keys(server.sockets).length).toBe(0);
  });

  let client;
  it("connects with a client", async () => {
    cn1 = connect();
    client = cn1.socket.connect("subject");
    const r = once(client, "data");
    client.write("hello");
    expect((await r)[0]).toBe("clients=1");
  });

  it("disconnects and sees the count of clients goes back to 0", async () => {
    client.close();
    await wait({
      until: () => {
        return Object.keys(server.sockets).length == 0;
      },
    });
  });

  it("creates a new client, connects to server, then closes the server and the client sees that it is no longer connected. Opening new server on same subject and it connects again.", async () => {
    client = cn1.socket.connect("subject");
    // confirm working:
    client.write("hello");
    const r = once(client, "data");
    client.write("hello");
    expect((await r)[0]).toBe("clients=1");

    expect(client.state).toBe("ready");
    // now close server and wait for state to quickly automatically
    // switch to not ready anymore
    const t0 = Date.now();
    server.close();
    await wait({
      until: () => client.state != "ready",
    });
    expect(Date.now() - t0).toBeLessThan(500);

    // Create new  server and it connects
    server = cn1.socket.listen("subject");
    await wait({
      until: () => client.state == "ready",
    });
  });
});

describe("create two socket servers with the same subject to test that sockets are sticky", () => {
  const subject = "sticks";
  let c1, c2, s1, s2;
  it("creates two distinct socket servers with the same subject", () => {
    c1 = connect();
    c2 = connect();
    s1 = c1.socket.listen(subject);
    s1.on("connection", (socket) => {
      socket.on("data", () => socket.write("s1"));
    });
    s2 = c2.socket.listen(subject);
    s2.on("connection", (socket) => {
      socket.on("data", () => socket.write("s2"));
    });
  });

  let c3, client, resp;
  it("creates a client and verifies writes all go to the same server", async () => {
    c3 = connect();
    client = c3.socket.connect(subject);
    const z = once(client, "data");
    client.write(null);
    resp = (await z)[0];
    // all additional messages end up going to the same server, because
    // of "sticky" subscriptions :-)
    for (let i = 0; i < 25; i++) {
      const z1 = once(client, "data");
      client.write(null);
      const resp1 = (await z1)[0];
      expect(resp1).toBe(resp);
    }
  });

  let c3b, s3;
  it("add another two servers and verify that messages still all go to the right place", async () => {
    c3b = connect();
    s3 = c1.socket.listen(subject);
    s3.on("connection", (socket) => {
      socket.on("data", () => socket.write("s3"));
    });
    for (let i = 0; i < 25; i++) {
      const z1 = once(client, "data");
      client.write(null);
      const resp1 = (await z1)[0];
      expect(resp1).toBe(resp);
    }
  });

  it("remove the server we're connected to and see that the client connects to another server automatically -- load balancing and automatic failover", async () => {
    if (resp == "s1") {
      s1.close();
    } else if (resp == "s2") {
      s2.close();
    }
    await wait({
      until: async () => {
        const z = once(client, "data");
        client.write(null);
        const resp1 = (await z)[0];
        // it's working again, but not using s1:
        return resp1 != resp;
      },
    });
  });

  it("cleans up", () => {
    s1.close();
    s2.close();
    s3.close();
    c1.close();
    c2.close();
    c3.close();
    c3b.close();
    client.close();
  });
});

describe("create a server where the subject has a wildcard, so clients can e.g., authentication themselves by having permission to write to the subject", () => {
  let client, server, cn1, cn2;
  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen("changefeeds.*");
    server.on("connection", (socket) => {
      socket.on("data", () => {
        socket.write(socket.subject.split(".")[1]);
      });
    });
  });

  it("connects as client on different matching subjects", async () => {
    cn2 = connect();
    client = cn2.socket.connect("changefeeds.account-5077");
    const x = once(client, "data");
    client.write(null);
    const [data] = await x;
    expect(data).toBe("account-5077");
    client.close();

    client = cn2.socket.connect("changefeeds.account-389");
    const x2 = once(client, "data");
    client.write(null);
    const [data2] = await x2;
    expect(data2).toBe("account-389");
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("Check that the automatic reconnection parameter works", () => {
  let client, server, cn1, cn2;
  it("creates the server", () => {
    cn1 = connect();
    server = cn1.socket.listen("recon");
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(data);
      });
    });
  });

  it("create a client with reconnection (the default) and confirm it works (all states hit)", async () => {
    const socket = cn1.socket.connect("recon");
    expect(socket.reconnection).toBe(true); // the default
    await once(socket, "ready");
    // have to listen before we trigger it:
    const y = once(socket, "disconnected");
    const x = once(socket, "connecting");
    socket.disconnect();
    const z = once(socket, "data");
    socket.write("hi"); // write when not connected
    await once(socket, "ready");
    await y;
    await x;
    expect((await z)[0]).toBe("hi");
    socket.close();
  });

  it("creates a client without reconnection", async () => {
    const socket = cn1.socket.connect("recon", { reconnection: false });
    expect(socket.reconnection).toBe(false);
    await once(socket, "ready");
    socket.disconnect();
    await delay(50);
    // still disconnected
    expect(socket.state).toBe("disconnected");
    // but we can manually connect
    socket.connect();
    await once(socket, "ready");
    socket.close();
  });
});

afterAll(after);
