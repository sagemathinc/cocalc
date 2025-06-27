/*

pnpm test `pwd`/supercluster.test.ts


*/

import {
  before,
  after,
  initConatServer,
  once,
  delay,
  wait,
} from "@cocalc/backend/conat/test/setup";
import {
  superclusterLink,
  superclusterStream,
  superclusterService,
  trimSuperclusterStream,
} from "@cocalc/conat/core/supercluster";
import { isEqual } from "lodash";

beforeAll(before);

let clusterName = 0;
async function createCluster(opts?) {
  clusterName += 1;
  const server = await initConatServer({
    clusterName: `${clusterName}`,
    id: "0",
    systemAccountPassword: "foo",
    ...opts,
  });
  const client = server.client();
  return { server, client };
}

describe("create a supercluster enabled socketio server and test that the streams update as they should", () => {
  let server, client;
  it("create a server with supercluster support enabled", async () => {
    ({ server, client } = await createCluster());
  });

  let stream;
  it("get the interest stream via our client. There MUST be at least two persist subjects in there, since they were needed to even create the interest stream.", async () => {
    stream = await superclusterStream({
      client,
      clusterName: server.options.clusterName,
    });
    const service = superclusterService(server.options.clusterName);
    await wait({
      until: () => {
        const v = stream.getAll();
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
      const v = stream.getAll().filter((x) => x.subject == "foo");
      if (v.length == 1) {
        expect(v[0]).toEqual(
          expect.objectContaining({ op: "add", subject: "foo" }),
        );
        break;
      }
      await once(stream, "change");
    }
    sub.close();
    while (true) {
      const v = stream.getAll().filter((x) => x.subject == "foo");
      if (v.length == 2) {
        expect(v[1]).toEqual(
          expect.objectContaining({ op: "delete", subject: "foo" }),
        );
        break;
      }
      await once(stream, "change");
    }
  });

  let link;
  it("get access to the same stream, but via a supercluster link, and note that it is identical to the one in the server -- keeping these pattern objects sync'd is the point of the link", async () => {
    link = await superclusterLink({ client, clusterName: server.clusterName });
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
    const client2 = server.client({ noCache: true });
    const link2 = await superclusterLink({
      client: client2,
      clusterName: server.clusterName,
    });
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
    client2.close();
  });
});

describe("create a supercluster with two distinct servers and send a message from one client to another via a link, and also use request/reply", () => {
  let server1, server2, client1, client2;
  it("create two distinct servers with supercluster support enabled", async () => {
    ({ server: server1, client: client1 } = await createCluster({
      systemAccountPassword: "squeamish",
    }));
    ({ server: server2, client: client2 } = await createCluster({
      systemAccountPassword: "ossifrage",
    }));
  });

  it("link them", async () => {
    await server1.addSuperclusterLink({
      client: client2,
      clusterName: server2.clusterName,
    });
    await server2.addSuperclusterLink({
      client: client1,
      clusterName: server1.clusterName,
    });
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
});

// This is basically identical to the previous one, but for a bigger supercluster:
const superClusterSize = 10;
describe(`a supercluster joining ${superClusterSize} different clusters`, () => {
  const servers: any[] = [],
    clients: any[] = [];
  it("create two distinct servers with supercluster support enabled", async () => {
    for (let i = 0; i < superClusterSize; i++) {
      const { server, client } = await createCluster({
        clusterName: `cluster-${i}`,
      });
      servers.push(server);
      clients.push(client);
    }
  });

  it("link them all together in a complete digraph", async () => {
    for (let i = 0; i < servers.length; i++) {
      for (let j = i + 1; j < servers.length; j++) {
        await servers[i].addSuperclusterLink({
          client: clients[j],
          clusterName: servers[j].clusterName,
        });
        await servers[j].addSuperclusterLink({
          client: clients[i],
          clusterName: servers[i].clusterName,
        });
      }
    }
  });

  let sub;
  it("creates a subscription on clients[0], then observe each other client sees it as existing and can send it a message", async () => {
    sub = await clients[0].subscribe("rsa");
    for (let i = 0; i < superClusterSize; i++) {
      await clients[i].waitForInterest("rsa");
      clients[i].publish("rsa", i);
    }
    for (let i = 0; i < superClusterSize; i++) {
      const { value } = await sub.next();
      expect(value.data).toBe(i);
    }
  });

  it("check that interest data is *eventually* consistent", async () => {
    for (let i = 0; i < superClusterSize; i++) {
      // now look at everybody else's view of cluster i.
      for (let j = 0; j < superClusterSize; j++) {
        if (i != j) {
          wait({
            until: () => {
              const link =
                servers[j].superclusterLinks[
                  `cluster-${i}`
                ].interest.serialize().patterns;
              const orig = servers[i].interest.serialize().patterns;
              return isEqual(orig, link);
            },
          });
        }
      }
    }
  });

  it("test request/reply from all participants", async () => {
    const v: any[] = [];
    for (let i = 0; i < superClusterSize; i++) {
      const req = clients[i].request("rsa", i);
      v.push(req);
    }
    for (let i = 0; i < superClusterSize; i++) {
      const { value } = await sub.next();
      expect(value.data).toBe(i);
      const { count } = await value.respond(i + 1);
      expect(count).toBeGreaterThan(0);
    }

    for (let i = 0; i < superClusterSize; i++) {
      const r = (await v[i]).data;
      expect(r).toBe(i + 1);
    }
  });
});

describe("test trimming the interest stream", () => {
  let server, client;
  it("create a supercluster server", async () => {
    ({ server, client } = await createCluster());
    await wait({ until: () => server.superclusterStream != null });
  });

  let sub;
  it("subscribes and verifies that trimming does nothing", async () => {
    sub = await client.sub("389");
    const seqs = await trimSuperclusterStream(
      server.superclusterStream,
      server.interest,
      0,
    );
    expect(seqs).toEqual([]);
  });

  it("unsubscribes and verifies that trimming with a 5s maxAge does nothing", async () => {
    sub.close();
    await delay(100);
    const seqs = await trimSuperclusterStream(
      server.superclusterStream,
      server.interest,
      5000,
    );
    expect(seqs).toEqual([]);
  });

  it(" see that two updates are trimmed when maxAge is 0s", async () => {
    // have to use wait since don't know how long until
    // stream actually updated after unsub.
    let seqs;
    await wait({
      until: async () => {
        seqs = await trimSuperclusterStream(
          server.superclusterStream,
          server.interest,
          0,
        );
        return seqs.length >= 2;
      },
    });
    expect(seqs.length).toBe(2);
    await delay(1);
    for (const update of server.superclusterStream.getAll()) {
      if (update.subject == "389" && update.op == "add") {
        throw Error("adding 389 should have been removed");
      }
    }
  });
});

afterAll(after);
