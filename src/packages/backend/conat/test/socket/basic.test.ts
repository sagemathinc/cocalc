/*

pnpm test `pwd`/basic.test.ts 

*/

import {
  before,
  after,
  connect,
  wait,
  setDefaultTimeouts,
} from "@cocalc/backend/conat/test/setup";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

beforeAll(async () => {
  await before();
  setDefaultTimeouts({ request: 750, publish: 750 });
});

describe("create a server and client, then send a message and get a response", () => {
  let client,
    server,
    cn1,
    cn2,
    subject = "response.double";

  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });
  });

  it("connects as client and tests out the server", async () => {
    cn2 = connect();
    client = cn2.socket.connect(subject);
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
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("create a client first, then the server, and see that write still works (testing the order); also include headers in both directions.", () => {
  let client, server, cn1, cn2, requestPromise;
  const subject = "cocalc-order";

  it("connects as client and writes to the server that doesn't exist yet", async () => {
    cn2 = connect();
    client = cn2.socket.connect(subject);
    client.write("cocalc", { headers: { my: "header" } });
  });

  it("we fire off a request as well, but don't wait for it", () => {
    requestPromise = client.request("foo");
  });

  it("creates the server", () => {
    cn1 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (socket) => {
      socket.on("data", (data, headers) => {
        socket.write(`${data}`.repeat(2), { headers });
      });
      socket.on("request", (mesg) => {
        mesg.respondSync("bar", { headers: "x" });
      });
    });
  });

  it("it still works out", async () => {
    const [data, headers] = await once(client, "data");
    expect(data).toBe("cocalccocalc");
    expect(headers).toEqual({ my: "header" });
  });

  it("get back the response from the request we created above", async () => {
    const response = await requestPromise;
    expect(response.data).toBe("bar");
    expect(response.headers).toBe("x");
  });

  it("cleans up", () => {
    client.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("create a client first and write more messages than the queue size results in an error", () => {
  let client, server, cn1, cn2;
  const subject = "conat.too.many.messages";

  let count = 5,
    maxQueueSize = 3,
    iter;
  it("connects as client with a small queue and fill it", async () => {
    cn2 = connect();
    let fails = 0;
    client = cn2.socket.connect(subject, { maxQueueSize });
    iter = client.iter();
    for (let i = 0; i < count; i++) {
      try {
        client.write(`${i}`);
      } catch (err) {
        // should fail for i=4,5
        expect(i).toBeGreaterThan(count - maxQueueSize);
        fails += 1;
      }
    }
    expect(fails).toBe(2);
    expect(client.queuedWrites.length).toBe(3);
  });

  const serverRecv: any[] = [];
  let serverSocket;
  it("creates the server", () => {
    cn1 = connect();
    server = cn1.socket.listen(subject, { maxQueueSize });
    server.on("connection", (socket) => {
      serverSocket = socket;
      socket.on("data", (data) => {
        serverRecv.push(data);
        socket.write(`${data}`.repeat(2));
      });
    });
  });

  it(`first ${maxQueueSize} messages do get sent`, async () => {
    for (let i = 0; i < maxQueueSize; i++) {
      const { value } = await iter.next();
      expect(value[0]).toBe(`${i}`.repeat(2));
    }
    expect(serverRecv).toEqual(["0", "1", "2"]);
  });

  it("wait for client to drain; then we can now send another message without an error", async () => {
    await client.waitUntilDrain();
    client.write("foo");
  });

  it("writing too many messages to the server socket also fails", async () => {
    if (serverSocket.tcp.send.unsent > 0) {
      await once(serverSocket, "drain");
    }
    expect(serverSocket.tcp.send.unsent).toBe(0);
    serverSocket.write(0);
    serverSocket.write(1);
    serverSocket.write(2);
    expect(() => serverSocket.write(3)).toThrow("WRITE FAILED");
    try {
      serverSocket.write(4);
    } catch (err) {
      expect(err.code).toBe("ENOBUFS");
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
    server = cn3.socket.listen("cocalc2");
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}`.repeat(2));
      });
    });

    cn1 = connect();
    client1 = cn1.socket.connect("cocalc2");
    cn2 = connect();
    client2 = cn2.socket.connect("cocalc2");
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
    server = cn1.socket.listen("disconnect.io");
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
    client = cn1.socket.connect("disconnect.io");
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

  it("creates a new client, connects to server, then closes the server and the client sees that and closes.", async () => {
    client = cn1.socket.connect("disconnect.io");
    const iter = client.iter();
    // confirm working:
    client.write("hello");
    const { value } = await iter.next();
    expect(value[0]).toBe("clients=1");

    expect(client.state).toBe("ready");
    const closed = once(client, "closed");
    // now close server and wait for state to quickly automatically
    // switch to not ready anymore
    const t0 = Date.now();
    server.close();
    await closed;
    expect(Date.now() - t0).toBeLessThan(250);
  });
});

describe("create two socket servers with the same subject to test that sockets are sticky", () => {
  const subject = "a.sticks.place";
  let c1, c2, s1, s2;
  it("creates two distinct socket servers with the same subject", () => {
    c1 = connect();
    c2 = connect();
    s1 = c1.socket.listen(subject);
    s1.on("connection", (socket) => {
      // console.log("s1 got connection");
      socket.on("data", () => {
        // console.log("s1 got data");
        socket.write("s1");
      });
      socket.on("request", (mesg) => mesg.respond("s1"));
    });
    s2 = c2.socket.listen(subject);
    s2.on("connection", (socket) => {
      // console.log("s2 got connection");
      socket.on("data", () => {
        //        console.log("s2 got data");
        socket.write("s2");
      });
      socket.on("request", (mesg) => mesg.respond("s2"));
    });
  });

  let c3, client, resp;
  it("creates a client and verifies writes all go to the same server", async () => {
    c3 = connect();
    client = c3.socket.connect(subject);
    const iter = client.iter();
    client.write(null);
    const { value } = await iter.next();
    resp = value[0];
    // all additional messages end up going to the same server, because
    // of "sticky" subscriptions :-)
    for (let i = 0; i < 25; i++) {
      client.write(null);
      const { value: value1 } = await iter.next();
      expect(resp).toBe(value1[0]);
    }
  });

  let c3b, s3;
  it("add one more server and verify that messages still all go to the right place", async () => {
    c3b = connect();
    s3 = c3b.socket.listen(subject);
    let newServerGotConnection = false;
    s3.on("connection", (socket) => {
      //console.log("s3 got a connection");
      newServerGotConnection = true;
      socket.on("data", () => {
        //console.log("s3 got data", { data });
        socket.write("s3");
      });
    });
    const iter = client.iter();
    for (let i = 0; i < 25; i++) {
      client.write(null);
      const { value: value1 } = await iter.next();
      if (resp != value1[0]) {
        throw Error("sticky load balancing failed!?");
      }
    }
    expect(newServerGotConnection).toBe(false); // redundant...
  });

  it("also verify that request/reply messaging go to the right place (stickiness works the same way)", async () => {
    for (let i = 0; i < 25; i++) {
      const x = await client.request(null);
      expect(x.data).toBe(resp);
    }
  });

  it("remove the server we're connected to and see that the client socket closes, since all state on the other end is gone (this is the only possible thing that should happen!)", async () => {
    if (resp == "s1") {
      s1.close();
    } else if (resp == "s2") {
      s2.close();
    }
    await once(client, "closed");
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
  let server, cn1;
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

    // write when not connected -- this should get sent
    // when we connect:
    socket.write("hi");

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

describe("creating multiple sockets from the one client to one server works (they should be distinct)", () => {
  let server, cn1, cn2;
  const subject = "multiple.sockets.edu";
  it("creates the client and server", () => {
    cn1 = connect();
    server = cn1.socket.listen(subject);
    server.on("connection", (socket) => {
      socket.on("data", (data) => {
        socket.write(`${data}-${socket.id}`);
      });
    });
  });

  it("creates two client sockets", async () => {
    cn2 = connect();
    const socket1 = cn2.socket.connect(subject);
    const socket2 = cn2.socket.connect(subject);
    expect(socket1.id).not.toEqual(socket2.id);
    const x = once(socket1, "data");
    const y = once(socket2, "data");
    socket1.write("cocalc");
    socket2.write("conat");
    const [data] = await x;
    expect(data).toBe(`cocalc-${socket1.id}`);
    const [data2] = await y;
    expect(data2).toBe(`conat-${socket2.id}`);
    const x1 = once(socket1, "data");
    const y1 = once(socket2, "data");

    // also test broadcast
    server.write("hello");
    expect((await x1)[0]).toBe("hello");
    expect((await y1)[0]).toBe("hello");

    socket1.close();
    socket2.close();
  });

  it("cleans up", () => {
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("test request/respond from client to server and from server to client", () => {
  let socket1, socket2, server, cn1, cn2, cn3;
  const subject = "request-respond-demo";
  const sockets: any[] = [];

  it("creates a server and two sockets", async () => {
    cn3 = connect();
    server = cn3.socket.listen(subject);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("request", (mesg) => {
        mesg.respond(`hi ${mesg.data}, from server`);
      });
    });

    cn1 = connect();
    socket1 = cn1.socket.connect(subject);
    socket1.on("request", (mesg) => {
      mesg.respond(`hi ${mesg.data}, from socket1`);
    });

    cn2 = connect();
    socket2 = cn2.socket.connect(subject);
    socket2.on("request", (mesg) => {
      mesg.respond(`hi ${mesg.data}, from socket2`);
    });
  });

  it("each socket calls the server", async () => {
    expect((await socket1.request("socket1")).data).toBe(
      "hi socket1, from server",
    );
    expect((await socket2.request("socket2")).data).toBe(
      "hi socket2, from server",
    );
  });

  it("the server individually calls each socket", async () => {
    // note that sockets[0] and sockets[1] might be in
    // either order.
    const x = (await sockets[0].request("server")).data;
    const y = (await sockets[1].request("server")).data;
    expect(x).not.toEqual(y);
    expect(x).toContain("hi server, from socket");
    expect(y).toContain("hi server, from socket");
  });

  it("broadcast a request to all connected sockets", async () => {
    const v = (await server.request("server")) as any;
    const w = v.map((y: any) => y.data);
    const S = new Set(["hi server, from socket1", "hi server, from socket2"]);
    expect(new Set(w)).toEqual(S);

    // also broadcast and use race, so we get just the first response.
    const x = await server.request("server", { race: true });
    expect(S.has(x.data)).toBe(true);
  });

  it("cleans up", () => {
    socket1.close();
    socket2.close();
    server.close();
    cn1.close();
    cn2.close();
    cn3.close();
  });
});

describe("test request/respond with headers", () => {
  let socket1,
    server,
    cn1,
    cn2,
    sockets: any[] = [];
  const subject = "request-respond-headers";

  it("creates a server and a socket", async () => {
    cn2 = connect();
    server = cn2.socket.listen(subject);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("request", (mesg) => {
        mesg.respond(`server: ${mesg.data}`, {
          headers: { ...mesg.headers, server: true },
        });
      });
    });

    cn1 = connect();
    socket1 = cn1.socket.connect(subject);
    socket1.on("request", (mesg) => {
      mesg.respond(`socket1: ${mesg.data}`, {
        headers: { ...mesg.headers, socket1: true },
      });
    });
  });

  it("headers work when client calls server", async () => {
    const x = await socket1.request("hi", { headers: { foo: 10 } });
    expect(x.data).toBe("server: hi");
    expect(x.headers).toEqual(
      expect.objectContaining({ foo: 10, server: true }),
    );
  });

  it("headers work when server calls client", async () => {
    const x = await sockets[0].request("hi", { headers: { foo: 10 } });
    expect(x.data).toBe("socket1: hi");
    expect(x.headers).toEqual(
      expect.objectContaining({ foo: 10, socket1: true }),
    );
  });

  it("cleans up", () => {
    socket1.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

describe("test requestMany/respond", () => {
  let socket1,
    server,
    cn1,
    cn2,
    sockets: any[] = [];
  const subject = "requestMany";

  it("creates a server that handles a requestMany, and a client", async () => {
    cn2 = connect();
    server = cn2.socket.listen(subject);
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("request", (mesg) => {
        for (let i = 0; i < mesg.data; i++) {
          mesg.respond(i);
        }
      });
    });

    cn1 = connect();
    socket1 = cn1.socket.connect(subject);
  });

  it("sends a requestMany request and get 3 responses", async () => {
    const sub = await socket1.requestMany(10);
    for (let i = 0; i < 10; i++) {
      expect((await sub.next()).value.data).toBe(i);
    }
    sub.close();
  });

  it("cleans up", () => {
    socket1.close();
    server.close();
    cn1.close();
    cn2.close();
  });
});

afterAll(after);
