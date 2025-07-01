/*

pnpm test `pwd`/cluster-basics.test.ts


*/

import {
  before,
  after,
  delay,
  once,
  wait,
} from "@cocalc/backend/conat/test/setup";
import {
  clusterLink,
  clusterStreams,
  clusterService,
  trimClusterStreams,
} from "@cocalc/conat/core/cluster";
import { isEqual } from "lodash";
import { createClusterNode } from "./util";
import type { Client } from "@cocalc/conat/core/client";
import { sysApi } from "@cocalc/conat/core/sys";

beforeAll(before);

describe("create a cluster enabled socketio server and test that the streams update as they should", () => {
  let server, client;
  it("create a server with cluster support enabled", async () => {
    ({ server, client } = await createClusterNode({
      clusterName: "cluster0",
      id: "0",
    }));
  });

  let streams;
  it("get the interest stream via our client. There MUST be at least two persist subjects in there, since they were needed to even create the interest stream.", async () => {
    streams = await clusterStreams({
      ...server.options,
      client,
    });
    const service = clusterService(server.options);
    await wait({
      until: () => {
        const v = streams.interest.getAll();
        expect(service).toContain(server.options.clusterName);
        const persistUpdates = v.filter((update) =>
          update.subject.startsWith(service),
        );
        if (persistUpdates.length <= 1) {
          return false;
        }
        expect(persistUpdates.length).toBeGreaterThan(1);
        return true;
      },
    });
  });

  it("subscribe and see update appear in the stream; close sub and see delete appear", async () => {
    const sub = await client.subscribe("foo");
    while (true) {
      const v = streams.interest.getAll().filter((x) => x.subject == "foo");
      if (v.length == 1) {
        expect(v[0]).toEqual(
          expect.objectContaining({ op: "add", subject: "foo" }),
        );
        break;
      }
      await once(streams.interest, "change");
    }
    sub.close();
    while (true) {
      const v = streams.interest.getAll().filter((x) => x.subject == "foo");
      if (v.length == 2) {
        expect(v[1]).toEqual(
          expect.objectContaining({ op: "delete", subject: "foo" }),
        );
        break;
      }
      await once(streams.interest, "change");
    }
  });

  let link;
  it("get access to the same stream, but via a cluster link, and note that it is identical to the one in the server -- keeping these pattern objects sync'd is the point of the link", async () => {
    link = await clusterLink(
      server.address(),
      server.options.systemAccountPassword,
      () => {},
    );
    await wait({
      until: () => {
        return (
          Object.keys(server.interest.serialize().patterns).length ==
          Object.keys(link.interest.serialize().patterns).length
        );
      },
    });
    expect(server.interest.serialize().patterns).toEqual(
      link.interest.serialize().patterns,
    );
  });

  it("creates a sub and see this reflected in the patterns", async () => {
    const sub = await client.subscribe("foo");
    await wait({
      until: () => link.interest.serialize().patterns["foo"] !== undefined,
    });
    // equal after making the subscription to foo
    expect(server.interest.serialize()).toEqual(link.interest.serialize());

    const { patterns } = link.interest.serialize();
    expect(patterns["foo"] != undefined).toBe(true);

    sub.close();
    await wait({
      until: () => link.interest.serialize().patterns["foo"] === undefined,
    });
    expect(patterns["foo"] === undefined).toBe(true);

    // still identical
    expect(server.interest.serialize()).toEqual(link.interest.serialize());
  });

  const count = 50;
  it(`make ${count} more subscriptions and see this reflected in the link`, async () => {
    const v: any[] = [];
    for (let i = 0; i < count; i++) {
      v.push(await client.subscribe(`foo.${i}`));
    }

    await wait({
      until: () =>
        link.interest.serialize().patterns[`foo.${count - 1}`] !== undefined,
    });

    expect(server.interest.serialize()).toEqual(link.interest.serialize());

    // and unsubscribe
    for (let i = 0; i < count; i++) {
      v[i].close();
    }
    await wait({
      until: () =>
        link.interest.serialize().patterns[`foo.${count - 1}`] === undefined,
    });

    expect(server.interest.serialize()).toEqual(link.interest.serialize());
  });

  it("a new link has correct state, despite the activity", async () => {
    const link2 = await clusterLink(
      server.address(),
      server.options.systemAccountPassword,
      () => {},
    );
    await wait({
      until: () => {
        return (
          Object.keys(server.interest.serialize().patterns).length ==
          // @ts-ignore
          Object.keys(link2.interest.serialize().patterns).length
        );
      },
    });
    expect(server.interest.serialize().patterns).toEqual(
      // @ts-ignore
      link2.interest.serialize().patterns,
    );
    link2.close();
  });
});

describe("create a cluster with two distinct servers and send a message from one client to another via a link, and also use request/reply", () => {
  let server1, server2, client1, client2;
  it("create two distinct servers with cluster support enabled", async () => {
    ({ server: server1, client: client1 } = await createClusterNode({
      clusterName: "cluster1",
      systemAccountPassword: "squeamish",
      id: "1",
    }));
    ({ server: server2, client: client2 } = await createClusterNode({
      clusterName: "cluster1",
      systemAccountPassword: "ossifrage",
      id: "2",
    }));
  });

  it("link them", async () => {
    await server1.join(server2.address());
    await server2.join(server1.address());
  });

  it("tests that server-side waitForInterest can be aborted", async () => {
    const controller = new AbortController();
    const w = server2.waitForInterest(
      "no-interest",
      90000,
      client2.conn.id,
      controller.signal,
    );
    await delay(15);
    controller.abort();
    expect(await w).toBe(false);
  });

  const N =
    "114381625757888867669235779976146612010218296721242362562561842935706935245733897830597123563958705058989075147599290026879543541";

  let sub;

  it("creates a subscription on client1, then publish to it from client2, thus using routing over the link", async () => {
    sub = await client1.subscribe("rsa");

    const x = await client2.publish("rsa", N);
    // interest hasn't propogated from one cluster to another yet:
    expect(x.count).toBe(0);

    await client2.waitForInterest("rsa");

    const y = await client2.publish("rsa", N);
    expect(y.count).toBe(1);

    const { value } = await sub.next();
    expect(value.data).toBe(N);
  });

  it("test request/reply between clusters", async () => {
    const req = client2.request("rsa", N);
    const { value } = await sub.next();
    expect(value.data).toBe(N);
    await wait({
      until: async () => {
        // ensure respons gets received -- it's possible for sub to be visible to client2
        // slightly before the inbox for client2 is visible, in which case client2
        // would never get a response and timeout.
        const { count } = await value.respond(
          "3490529510847650949147849619903898133417764638493387843990820577 × 32769132993266709549961988190834461413177642967992942539798288533",
        );
        return count > 0;
      },
    });
    const response = await req;
    expect(response.data).toContain("×");
  });

  it("remove the links", async () => {
    const sub = await client1.subscribe("x");
    await server1.unjoin({ id: "2" });
    await server2.unjoin({ id: "1" });
    const { count } = await client1.publish("x", "hello");
    expect(count).toBe(1);
    const { count: count2 } = await client2.publish("x", "hello");
    expect(count2).toBe(0);
    sub.close();
  });
});

// This is basically identical to the previous one, but for a bigger cluster:
const clusterSize = 5;
describe(`a cluster with ${clusterSize} nodes`, () => {
  const servers: any[] = [],
    clients: any[] = [];
  it(`create ${clusterSize} distinct servers with cluster support enabled`, async () => {
    for (let i = 0; i < clusterSize; i++) {
      const { server, client } = await createClusterNode({
        clusterName: "my-cluster",
        id: `node-${i}`,
      });
      expect(server.options.id).toBe(`node-${i}`);
      expect(server.options.clusterName).toBe("my-cluster");
      servers.push(server);
      clients.push(client);
    }
  });

  it("link them all together in a complete digraph", async () => {
    for (let i = 0; i < servers.length; i++) {
      for (let j = i + 1; j < servers.length; j++) {
        await servers[i].join(servers[j].address());
        await servers[j].join(servers[i].address());
      }
    }
  });

  it("get addresses and topology", async () => {
    await clients[0].waitUntilSignedIn();
    for (let i = 0; i < clusterSize; i++) {
      const sys = sysApi(clients[i]);
      expect(new Set(await sys.clusterAddresses()).size).toBe(clusterSize);
    }
    const t = await sysApi(clients[0]).clusterTopology();
    expect(Object.keys(t)).toEqual(["my-cluster"]);
    const v = Object.values(t["my-cluster"]);
    expect(new Set(v)).toEqual(
      new Set(servers.map((server) => server.address())),
    );
  });

  let sub;
  it("creates a subscription on clients[0], then observe each other client sees it as existing and can send it a message", async () => {
    sub = await clients[0].subscribe("rsa");
    for (let i = 0; i < clusterSize; i++) {
      await clients[i].waitForInterest("rsa");
      clients[i].publish("rsa", i);
    }
    for (let i = 0; i < clusterSize; i++) {
      const { value } = await sub.next();
      expect(value.data).toBe(i);
    }
  });

  it("check that interest data is *eventually* consistent", async () => {
    for (let i = 0; i < clusterSize; i++) {
      // now look at everybody else's view of cluster i.
      for (let j = 0; j < clusterSize; j++) {
        if (i != j) {
          await wait({
            until: () => {
              const link =
                servers[j].clusterLinks["my-cluster"][
                  `node-${i}`
                ].interest.serialize().patterns;
              const orig = servers[i].interest.serialize().patterns;
              return isEqual(orig, link);
            },
          });
        }
      }
    }
  });

  it("test request/respond from all participants", async () => {
    await delay(500);
    const v: any[] = [];
    for (let i = 0; i < clusterSize; i++) {
      const req = clients[i].request("rsa", i);
      v.push(req);
    }
    for (let i = 0; i < clusterSize; i++) {
      const { value } = await sub.next();
      expect(value.data).toBe(i);
      const { count } = await value.respond(i + 1);
      expect(count).toBeGreaterThan(0);
    }

    for (let i = 0; i < clusterSize; i++) {
      const r = (await v[i]).data;
      expect(r).toBe(i + 1);
    }
  });
});

describe("test trimming the interest stream", () => {
  let server, client;
  it("create a cluster server", async () => {
    ({ server, client } = await createClusterNode({
      id: "0",
      clusterName: "trim",
    }));
    await wait({ until: () => server.clusterStreams != null });
  });

  let sub;
  it("subscribes and verifies that trimming does nothing", async () => {
    sub = await client.sub("389");
    const seqs = await trimClusterStreams(server.clusterStreams, server, 0);
    expect(seqs).toEqual([]);
  });

  it("unsubscribes and verifies that trimming with a 5s maxAge does nothing", async () => {
    sub.close();
    await delay(100);
    const seqs = await trimClusterStreams(server.clusterStreams, server, 5000);
    expect(seqs).toEqual([]);
  });

  it(" see that two updates are trimmed when maxAge is 0s", async () => {
    // have to use wait since don't know how long until
    // stream actually updated after unsub.
    let seqs;
    await wait({
      until: async () => {
        seqs = await trimClusterStreams(server.clusterStreams, server, 0);
        return seqs.length >= 2;
      },
    });
    expect(seqs.length).toBe(2);
    await delay(1);
    for (const update of server.clusterStreams.interest.getAll()) {
      if (update.subject == "389" && update.op == "add") {
        throw Error("adding 389 should have been removed");
      }
    }
  });
});

describe("join two servers in a cluster using the sys api instead of directly calling join on the server objects", () => {
  let server1, server2, client1: Client, client2: Client;
  const systemAccountPassword = "squeamish ossifrage";
  it("create two distinct servers with cluster support enabled", async () => {
    ({ server: server1, client: client1 } = await createClusterNode({
      clusterName: "cluster-sys",
      systemAccountPassword,
      id: "1",
    }));
    ({ server: server2, client: client2 } = await createClusterNode({
      clusterName: "cluster-sys",
      systemAccountPassword,
      id: "2",
    }));
  });

  let sys1, sys2;
  it("link them using the sys api", async () => {
    sys1 = sysApi(client1);
    expect(await sys1.clusterAddresses()).toEqual([server1.address()]);
    await sys1.join(server2.address());
    expect(await sys1.clusterAddresses()).toEqual([
      server1.address(),
      server2.address(),
    ]);
    expect(await sys1.clusterTopology()).toEqual({
      "cluster-sys": {
        "1": server1.address(),
        "2": server2.address(),
      },
    });

    sys2 = sysApi(client2);
    expect(await sys2.clusterAddresses()).toEqual([server2.address()]);
    await sys2.join(server1.address());
    expect(await sys2.clusterAddresses()).toEqual([
      server2.address(),
      server1.address(),
    ]);
    expect(await sys1.clusterTopology()).toEqual(await sys2.clusterTopology());
  });

  let sub;
  it("verify link worked", async () => {
    sub = await client1.subscribe("x");
    await client2.waitForInterest("x");
    const { count } = await client2.publish("x", "hello");
    expect(count).toBe(1);
    const { value } = await sub.next();
    expect(value.data).toBe("hello");
  });

  it("remove the links", async () => {
    await sys1.unjoin({ id: "2" });
    await sys2.unjoin({ id: "1" });
    const { count } = await client1.publish("x", "hello");
    expect(count).toBe(1);
    const { count: count2 } = await client2.publish("x", "hello");
    expect(count2).toBe(0);
    sub.close();

    expect(await sys1.clusterAddresses()).toEqual([server1.address()]);
    expect(await sys2.clusterAddresses()).toEqual([server2.address()]);
    expect(await sys1.clusterTopology()).toEqual({
      "cluster-sys": {
        "1": server1.address(),
      },
    });
    expect(await sys2.clusterTopology()).toEqual({
      "cluster-sys": {
        "2": server2.address(),
      },
    });
  });
});

describe("test automatic node discovery", () => {
  // create a cluster with 3 nodes just two edges connecting them
  const nodes: { client; server }[] = [];

  it("create three distinct servers with cluster support enabled", async () => {
    nodes.push(
      await createClusterNode({ id: "node0", clusterName: "discovery" }),
    );
    nodes.push(
      await createClusterNode({ id: "node1", clusterName: "discovery" }),
    );
    nodes.push(
      await createClusterNode({ id: "node2", clusterName: "discovery" }),
    );
    // different cluster
    nodes.push(await createClusterNode({ id: "node0", clusterName: "moon" }));
  });

  it("connect them in the minimal possible way", async () => {
    await nodes[0].server.join(nodes[1].server.address());
    await nodes[1].server.join(nodes[2].server.address());

    // plus one to the other cluster
    await nodes[0].server.join(nodes[3].server.address());

    expect(nodes[0].server.clusterAddresses("discovery").length).toBe(2);
    expect(nodes[1].server.clusterAddresses("discovery").length).toBe(2);
    expect(nodes[2].server.clusterAddresses("discovery").length).toBe(1);
  });

  it("run scan from node0. this results in the following new connections:  1->0, 0->2", async () => {
    const { count, errors } = await nodes[0].server.scan();
    expect(count).toBe(2);
    expect(errors.length).toBe(0);
    expect(nodes[0].server.clusterAddresses("discovery").length).toBe(3);
    expect(nodes[1].server.clusterAddresses("discovery").length).toBe(3);
    expect(nodes[2].server.clusterAddresses("discovery").length).toBe(1);
  });

  it("run scan from node1. this should result in the following new connections: 2->1 ", async () => {
    const { count, errors } = await nodes[1].server.scan();
    expect(count).toBe(1);
    expect(errors.length).toBe(0);
    expect(nodes[2].server.clusterAddresses("discovery").length).toBe(2);
  });

  it("run scan from node2. this should result in the following new connections: 2->0.  We now have the complete graph.", async () => {
    const { count, errors } = await nodes[2].server.scan();
    expect(count).toBe(1);
    expect(errors.length).toBe(0);
    expect(nodes[2].server.clusterAddresses("discovery").length).toBe(3);
  });

  it("join a new node3 (=nodes[4] due to other cluster node) to node2 and do a scan", async () => {
    nodes.push(
      await createClusterNode({ id: "node3", clusterName: "discovery" }),
    );
    await nodes[4].server.join(nodes[2].server.address());
    // only knows about self and node2 initially
    expect(nodes[4].server.clusterAddresses("discovery").length).toBe(2);

    // new node scans and now it knows about ALL nodes in the cluster
    expect((await nodes[4].server.scan()).count).toBe(3);
    expect(nodes[4].server.clusterAddresses("discovery").length).toBe(4);

    // have the other 3 nodes scan so they know all nodes:
    for (let i = 0; i < 3; i++) {
      await nodes[i].server.scan();
      expect(nodes[i].server.clusterAddresses("discovery").length).toBe(4);
    }
  });
});

describe("test automatic node discovery", () => {
  const nodes: { client; server }[] = [];
  const clusterName = "auto";
  const create = async (id) => {
    nodes.push(
      await createClusterNode({
        id,
        clusterName,
        autoscanInterval: 50,
        longAutoscanInterval: 6000,
      }),
    );
  };

  it("create three distinct servers with cluster support enabled", async () => {
    await create("node0");
    await create("node1");
  });

  it("connect 0 -> 1 and see other link get automatically added", async () => {
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(1);
    await nodes[0].server.join(nodes[1].server.address());
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[1].server.clusterAddresses(clusterName).length).toBe(1);
    await wait({
      until: () => {
        return nodes[1].server.clusterAddresses(clusterName).length == 2;
      },
    });
  });

  it("make a new node and a connection 2 -> 1 and observe cluster gets completed automatically", async () => {
    await create("node2");
    await nodes[2].server.join(nodes[1].server.address());
    // node0 and node1 don't instantly know node2
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[1].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[2].server.clusterAddresses(clusterName).length).toBe(2);
    // but soon they will all know each other
    await wait({
      until: () => {
        return (
          nodes[0].server.clusterAddresses(clusterName).length == 3 &&
          nodes[1].server.clusterAddresses(clusterName).length == 3 &&
          nodes[2].server.clusterAddresses(clusterName).length == 3
        );
      },
    });
  });

  const count = 5;
  it(`add ${count} more nodes`, async () => {
    for (let i = 3; i < 3 + count; i++) {
      await create(`node${i}`);
      await nodes[i].server.join(nodes[i - 1].server.address());
    }
    const total = nodes.length;
    await wait({
      until: () => {
        for (let i = 0; i < total; i++) {
          if (nodes[i].server.clusterAddresses(clusterName).length != total) {
            return false;
          }
        }
        return true;
      },
    });
  });
});

afterAll(after);
