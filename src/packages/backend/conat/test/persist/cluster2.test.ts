/*

pnpm test `pwd`/cluster2.test.ts

*/

import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import {
  after,
  before,
  server,
  addNodeToDefaultCluster,
  once,
  persistServer as persistServer0,
  waitForConsistentState,
} from "../setup";
import { uuid } from "@cocalc/util/misc";
const BROKEN_THRESH = 30;

beforeAll(before);

describe("test using multiple persist servers in a cluster", () => {
  let client0, server1, client1;
  it("add another node", async () => {
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

  it("wait until both servers in the cluster have the same state", async () => {
    await waitForConsistentState([server, server1], 2000);
  });

  const openStreamsConnectedToBothServers0: any[] = [];
  const openStreamsConnectedToBothServers1: any[] = [];
  it("create more streams connected to both servers to use both", async () => {
    // make random streams, with at least one new one connected to each
    // persist server
    expect(Object.keys(persistServer0.sockets).length).toBe(0);
    expect(Object.keys(persistServer1.sockets).length).toBe(0);
    while (
      Object.keys(persistServer0.sockets).length == 0 ||
      Object.keys(persistServer1.sockets).length == 0
    ) {
      const project_id = uuid();
      const before = [
        Object.keys(persistServer0.sockets).length,
        Object.keys(persistServer1.sockets).length,
      ];
      const s = await client1.sync.dstream({
        project_id,
        name: "foo",
        noCache: true,
      });
      await s.publish("x");
      openStreamsConnectedToBothServers0.push(s);
      if (openStreamsConnectedToBothServers0.length > BROKEN_THRESH) {
        throw Error("sticky queue groups are clearly not working properly");
      }
      const t = await client0.sync.dstream({
        project_id,
        name: "foo",
        noCache: true,
      });
      expect(t.getAll()).toEqual(["x"]);
      openStreamsConnectedToBothServers1.push(t);
      // since the two streams s and t we created above are for the same dstream,
      // they MUST have connected to the same persist server, so the count must
      // have gone up by TWO for either server0 or server1.
      const after = [
        Object.keys(persistServer0.sockets).length,
        Object.keys(persistServer1.sockets).length,
      ];
      // differences must be even
      expect((after[0] - before[0]) % 2).toBe(0);
      expect((after[1] - before[1]) % 2).toBe(0);
    }
    expect(openStreamsConnectedToBothServers0.length).toBeGreaterThan(1);
  });
});

afterAll(after);
