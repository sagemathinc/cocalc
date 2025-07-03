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
} from "../setup";
import { uuid } from "@cocalc/util/misc";

const BROKEN_THRESH = 30;

beforeAll(before);

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
    // we need to wait until the persist server is known to both nodes in the cluster.
    // 1s should be plenty of time.
    await delay(1000);
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
      if (v.length > BROKEN_THRESH) {
        throw Error("sticky queue groups are clearly not working properly");
      }
    }
    v.map((x) => x.close());

    // wait for all the sockets to close in order to not mess up other tests,
    // and also shows that sockets are freed properly
    await wait({
      until: () =>
        Object.keys(persistServer0.sockets).length <= n0 &&
        Object.keys(persistServer1.sockets).length <= n1,
    });
  });

  const project_ids: string[] = [];
  it("same test as above, but with client connected to server0", async () => {
    const v: any[] = [];
    const n0 = Object.keys(persistServer0.sockets).length;
    const n1 = Object.keys(persistServer1.sockets).length;
    while (
      Object.keys(persistServer0.sockets).length <= n0 ||
      Object.keys(persistServer1.sockets).length <= n1
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

    // wait for all the sockets to close in order to not mess up other tests
    await wait({
      until: () =>
        Object.keys(persistServer0.sockets).length <= n0 ||
        Object.keys(persistServer1.sockets).length <= n1,
    });
  });

  const openStreamsConnectedToBothServers0: any[] = [];
  const openStreamsConnectedToBothServers1: any[] = [];
  it("create more streams connected to both servers to use both", async () => {
    // make more random streams, with at least one new one connected to each
    // persist server
    const n0 = Object.keys(persistServer0.sockets).length;
    const n1 = Object.keys(persistServer1.sockets).length;
    while (
      Object.keys(persistServer0.sockets).length <= n0 ||
      Object.keys(persistServer1.sockets).length <= n1
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
    console.log(openStreamsConnectedToBothServers0.length);
    for (let i = 0; i < openStreamsConnectedToBothServers0.length; i++) {
      const stream0 = openStreamsConnectedToBothServers0[i];
      stream0.publish("y");
      await stream0.save();
      expect(stream0.hasUnsavedChanges()).toBe(false);
      const stream1 = openStreamsConnectedToBothServers1[i];
      expect(stream0.opts.project_id).toEqual(stream1.opts.project_id);
      await wait({ until: () => stream1.length >= 2 });
      console.log(i, stream1.messages, stream1.getAll(), stream0.getAll());
      expect(stream1.length).toBe(2);
    }
  });
});

describe("more tests", () => {
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
    // wait until it is known
    await delay(1000);
  });

  const openStreamsConnectedToBothServers0: any[] = [];
  const openStreamsConnectedToBothServers1: any[] = [];
  it("create more streams connected to both servers to use both", async () => {
    // make more random streams, with at least one new one connected to each
    // persist server
    const n0 = Object.keys(persistServer0.sockets).length;
    const n1 = Object.keys(persistServer1.sockets).length;
    while (
      Object.keys(persistServer0.sockets).length <= n0 ||
      Object.keys(persistServer1.sockets).length <= n1
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
      expect(before[0] + before[1] + 2).toBe(after[0] + after[1]);
      // differences must be even
      expect((after[0] - before[0]) % 2).toBe(0);
      expect((after[1] - before[1]) % 2).toBe(0);
    }
    expect(openStreamsConnectedToBothServers0.length).toBeGreaterThan(1);
  });
});

afterAll(after);
