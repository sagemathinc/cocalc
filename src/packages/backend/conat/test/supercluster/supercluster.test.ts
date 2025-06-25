/*


*/

import {
  before,
  after,
  initConatServer,
  once,
  delay,
  wait,
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
          Object.keys(link2.interest.serialize().patterns).length
        );
      },
    });
    expect(server.interest.serialize().patterns).toEqual(
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

afterAll(after);
