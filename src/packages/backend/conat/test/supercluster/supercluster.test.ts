/*


*/

import {
  before,
  after,
  initConatServer,
  once,
} from "@cocalc/backend/conat/test/setup";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { SUPERCLUSTER_INTEREST_STREAM_NAME } from "@cocalc/conat/core/server";

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
    const v = stream.getAll();
    const persistUpdates = v.filter((update) =>
      update.subject.startsWith("persist."),
    );
    expect(persistUpdates.length).toBeGreaterThan(1);
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

  it("cleans up", async () => {
    client.close();
    persist.close();
    server.close();
  });
});

afterAll(after);
