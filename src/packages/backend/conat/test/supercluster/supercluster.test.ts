/*


*/

import {
  before,
  after,
  initConatServer,
  once,
  wait,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { SUPERCLUSTER_INTEREST_STREAM_NAME } from "@cocalc/conat/core/server";
import { superclusterLink } from "@cocalc/conat/core/supercluster";

beforeAll(before);

describe("create a supercluster enabled socketio server and test that the streams update as they should", () => {
  let server, client, persist;
  it("create a server with supercluster support enabled", async () => {
    server = await initConatServer({
      supercluster: true,
      id: "0",
      systemAccountPassword: "foo",
    });
    client = server.client();
    // critical to also have a persistence server, since that's needed for seeing the supercluster info.
    persist = await createPersistServer({ client });
  });

  let stream;
  it("get the interest stream via our client. There MUST be at least two persist subjects in there, since they were needed to even create the interest stream.", async () => {
    stream = await client.sync.dstream({
      name: SUPERCLUSTER_INTEREST_STREAM_NAME,
    });
    await wait({
      until: () => {
        const v = stream.getAll();

        const persistUpdates = v.filter((update) =>
          update.subject.startsWith("persist."),
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
    link = await superclusterLink(client);
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
    const link2 = await superclusterLink(client2);
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

  it("cleans up", async () => {
    client.close();
    persist.close();
    server.close();
  });
});

describe("create a supercluster with two distinct servers and send a message from one client to another via a link", () => {
  let server1, server2, client1, client2;
  it("create two distinct servers with supercluster support enabled", async () => {
    server1 = await initConatServer({
      supercluster: true,
      id: "0",
      systemAccountPassword: "squeamish",
    });
    client1 = server1.client();
    await createPersistServer({ client: client1 });

    server2 = await initConatServer({
      supercluster: true,
      id: "0",
      systemAccountPassword: "ossifrage",
    });
    client2 = server2.client();
    await createPersistServer({ client: client2 });
  });

  it("link them", async () => {
    await server1.addSuperclusterLink(client2);
    await server2.addSuperclusterLink(client1);
  });

  const N =
    "114381625757888867669235779976146612010218296721242362562561842935706935245733897830597123563958705058989075147599290026879543541";

  let sub;

  it("create a subscription on client1, then publish to it from client2, thus using routing over the link", async () => {
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
    value.respond(
      "3490529510847650949147849619903898133417764638493387843990820577 × 32769132993266709549961988190834461413177642967992942539798288533",
    );
    const response = await req;
    expect(response.data).toContain("×");
  });
});

afterAll(after);
