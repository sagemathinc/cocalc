import { before, after } from "@cocalc/backend/conat/test/setup";
import { createClusterNode } from "./util";
import getPort from "@cocalc/backend/get-port";

beforeAll(before);

describe("adding a node times out if we can't connect to it, rather than trying forever", () => {
  it("tries to add a link to a node that doesn't exist", async () => {
    const { server } = await createClusterNode({
      clusterName: "cluster0",
      id: "1",
    });
    const port = await getPort();
    expect(async () => {
      await server.join(`localhost:${port}`, { timeout: 500 });
    }).rejects.toThrow("timeout");
  });
});

afterAll(after);
