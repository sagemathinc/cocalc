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
  wait,
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
    await waitForConsistentState([server, server1], 5000);
  });

  const openStreamsConnectedToBothServers0: any[] = [];
  const openStreamsConnectedToBothServers1: any[] = [];
  it("create more streams connected to both servers, in each case illustrating as well that the stream works from both clients", async () => {
    expect(Object.keys(persistServer0.sockets).length).toBe(0);
    expect(Object.keys(persistServer1.sockets).length).toBe(0);
    // create random streams, until we get at least one new one connected to each
    // of the two persist servers
    while (
      Object.keys(persistServer0.sockets).length == 0 ||
      Object.keys(persistServer1.sockets).length == 0
    ) {
      const project_id = uuid();
      const s = await client1.sync.dstream({
        project_id,
        name: "foo",
        noCache: true,
        // we make these ephemeral so there's no possibility of communication via the filesystem
        // in case different persist servers were used!
        ephemeral: true,
      });
      s.publish("x");
      await s.save();
      openStreamsConnectedToBothServers0.push(s);
      if (openStreamsConnectedToBothServers0.length > BROKEN_THRESH) {
        throw Error("sticky queue groups are clearly not working properly");
      }
      const t = await client0.sync.dstream({
        project_id,
        name: "foo",
        noCache: true,
        ephemeral: true,
      });
      openStreamsConnectedToBothServers1.push(t);

      expect(t.getAll()).toEqual(["x"]);
      t.publish("y");
      await t.save();

      await wait({ until: () => s.length == 2 });
      expect(s.getAll()).toEqual(["x", "y"]);
    }
    expect(openStreamsConnectedToBothServers0.length).toBeGreaterThan(1);
    expect(openStreamsConnectedToBothServers1.length).toBeGreaterThan(1);
  });
});

afterAll(after);
