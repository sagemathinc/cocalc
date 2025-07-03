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
  wait,
  setDefaultTimeouts,
  waitForConsistentState,
} from "../setup";
import { uuid } from "@cocalc/util/misc";

const BROKEN_THRESH = 30;

beforeAll(async () => {
  await before();
  // this speeds up the automatic failover tests a lot.
  setDefaultTimeouts({ request: 1000, publish: 1000 });
});

jest.setTimeout(15000);
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
    await waitForConsistentState([server, server1]);
  });

  it("make streams until there is at least one connection to each persist server -- this must happen quickly at random due to how sticky queue groups work", async () => {
    const v: any[] = [];
    // baseline - no sockets
    await wait({
      until: () =>
        Object.keys(persistServer0.sockets).length == 0 &&
        Object.keys(persistServer1.sockets).length == 0,
    });
    while (
      Object.keys(persistServer0.sockets).length == 0 ||
      Object.keys(persistServer1.sockets).length == 0
    ) {
      const s = await client1.sync.dstream({ project_id: uuid(), name: "foo" });
      // this helps give time for the persist server added above to be known
      await delay(50);
      v.push(s);
      if (v.length > BROKEN_THRESH) {
        throw Error("sticky queue groups are clearly not working properly");
      }
    }
    v.map((x) => x.close());
  });

  const project_ids: string[] = [];
  it("same test as above, but with client connected to server0", async () => {
    // baseline
    await wait({
      until: () =>
        Object.keys(persistServer0.sockets).length == 0 &&
        Object.keys(persistServer1.sockets).length == 0,
    });

    const v: any[] = [];
    while (
      Object.keys(persistServer0.sockets).length == 0 ||
      Object.keys(persistServer1.sockets).length == 0
    ) {
      const project_id = uuid();
      project_ids.push(project_id);
      const s = await client0.sync.dstream({ project_id, name: "foo" });
      v.push(s);
      s.publish(project_id);
      await s.save();
      if (v.length > BROKEN_THRESH) {
        throw Error("sticky queue groups are clearly not working properly");
      }
    }
    v.map((x) => x.close());
  });

  const openStreamsConnectedToBothServers0: any[] = [];
  const openStreamsConnectedToBothServers1: any[] = [];
  it("create more streams connected to both servers to use both", async () => {
    // wait for all the sockets to close in order to not mess up other tests
    await wait({
      until: () =>
        Object.keys(persistServer0.sockets).length == 0 ||
        Object.keys(persistServer1.sockets).length == 0,
    });

    while (
      Object.keys(persistServer0.sockets).length == 0 ||
      Object.keys(persistServer1.sockets).length == 0
    ) {
      const project_id = uuid();
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
    }
    expect(openStreamsConnectedToBothServers0.length).toBeGreaterThan(1);
  });

  it("remove one persist server", async () => {
    persistServer1.close();
  });

  it("creating / opening streams we made above still work with no data lost", async () => {
    for (const project_id of project_ids) {
      const s = await client0.sync.dstream({ project_id, name: "foo" });
      expect(await s.getAll()).toEqual([project_id]);
      s.close();
    }

    expect(persistServer1.sockets).toEqual({});
  });

  // this can definitely take a long time (e.g., ~10s), as it involves automatic failover.
  it("Checks automatic failover works:  the streams connected to both servers we created above must keep working, despite at least one of them having its persist server get closed.", async () => {
    for (let i = 0; i < openStreamsConnectedToBothServers0.length; i++) {
      const stream0 = openStreamsConnectedToBothServers0[i];
      stream0.publish("y");
      await stream0.save();
      expect(stream0.hasUnsavedChanges()).toBe(false);
      const stream1 = openStreamsConnectedToBothServers1[i];
      expect(stream0.opts.project_id).toEqual(stream1.opts.project_id);
      await wait({ until: () => stream1.length >= 2 });
      expect(stream1.length).toBe(2);
    }
  });
});

afterAll(after);
