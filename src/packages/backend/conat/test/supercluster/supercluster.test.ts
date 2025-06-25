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

describe("", () => {
  let server, client, persist;
  it("create a server with supercluster enabled", async () => {
    server = await initConatServer({ supercluster: true, id: "0" });
    client = server.client();
    persist = await createPersistServer({ client });
  });

  let stream;
  it("view the interest stream", async () => {
    stream = await client.sync.dstream({
      name: SUPERCLUSTER_INTEREST_STREAM_NAME,
    });
  });

  it("subscribe and see it appear in the stream", async () => {
    const sub = await client.subscribe("foo");
    const [update] = await once(stream, "change");
    expect(update).toEqual(
      expect.objectContaining({ op: "add", subject: "foo" }),
    );
    sub.close();
  });

  it("clean up", () => {
    persist.close();
    client.close();
    server.close();
  });
});

afterAll(after);
