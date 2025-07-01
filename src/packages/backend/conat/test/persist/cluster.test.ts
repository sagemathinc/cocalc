/*

pnpm test `pwd`/cluster.test.ts

*/

import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import {
  after,
  before,
  server,
  addNodeToDefaultCluster,
  once,
  delay,
  persistServer as persistServer0,
} from "../setup";
import { uuid } from "@cocalc/util/misc";

beforeAll(before);

describe("test using multiple persist servers in a cluster", () => {
  let client0, server1, client1;
  it.only("add another node", async () => {
    client0 = server.client();
    server1 = await addNodeToDefaultCluster();
    client1 = server1.client();
  });

  let persistServer1;
  it("add a second persist server connected to server1", async () => {
    persistServer1 = createPersistServer({ client: client1 });
    await once(persistServer1, "ready");
    expect(persistServer1.state).toBe("ready");
  });

  it("make streams until there is at least one connection to each persist server -- this must happen quickly at random due to how sticky queue groups work", async () => {
    const v: any[] = [];
    const n0 = Object.keys(persistServer0.sockets).length;
    const n1 = Object.keys(persistServer1.sockets).length;
    while (
      Object.keys(persistServer0.sockets).length <= n0 ||
      Object.keys(persistServer1.sockets).length <= n1
    ) {
      const s = await client1.sync.dstream({ project_id: uuid(), name: "foo" });
      v.push(s);
      console.log(
        "from 1",
        Object.keys(persistServer0.sockets).length,
        Object.keys(persistServer1.sockets).length,
      );
      await delay(50);
      if (v.length > 20) {
        throw Error("sticky queue groups are clearly not working properly");
      }
    }
  });

  it("same test as above, but with client connected to server0", async () => {
    const v: any[] = [];
    const n0 = Object.keys(persistServer0.sockets).length;
    const n1 = Object.keys(persistServer1.sockets).length;
    while (
      Object.keys(persistServer0.sockets).length <= n0 ||
      Object.keys(persistServer1.sockets).length <= n1
    ) {
      const s = await client0.sync.dstream({ project_id: uuid(), name: "foo" });
      v.push(s);
      await delay(50);
      console.log(
        "from 0",
        Object.keys(persistServer0.sockets).length,
        Object.keys(persistServer1.sockets).length,
      );
      if (v.length > 20) {
        throw Error("sticky queue groups are clearly not working properly");
      }
    }
  });
});

afterAll(after);
