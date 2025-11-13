/*
What happens when a node is removed from the cluster.
*/

import {
  before,
  after,
  server,
  addNodeToDefaultCluster,
  wait,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("setup basic pub/sub test with a 2-node cluster, then remove a node and observe that subscriber vanishes", () => {
  let client0, server1, client1;
  it("add another node to cluster", async () => {
    client0 = server.client();
    server1 = await addNodeToDefaultCluster();
    client1 = server1.client();
  });

  it("checks addresses before deleting server1", () => {
    expect(server.clusterAddresses()).toEqual([
      server.address(),
      server1.address(),
    ]);
  });

  let sub;
  it("subscribe", async () => {
    sub = await client1.subscribe("cocalc");
  });

  it("publish -- message is initially dropped with no receiver because interest doesn't propogate instantly", async () => {
    const { count } = await client0.publish("cocalc", "hi");
    expect(count).toBe(0);
  });

  it("publish after waiting for interest -- this works", async () => {
    await client0.waitForInterest("cocalc");
    const { count, bytes } = await client0.publish("cocalc", "hi");
    expect(count).toBe(1);
    expect(bytes).toBe(3);
  });

  it("receive", async () => {
    const { value } = await sub.next();
    expect(value.data).toBe("hi");
  });

  it("now kill the second node", async () => {
    server1.close();
  });

  it("publish -- message should be dropped as soon as the server client0 is connected to notices that server1 is dead", async () => {
    await wait({
      until: async () => {
        const { count } = await client0.publish("cocalc", "hi");
        return count == 0;
      },
      timeout: 3000,
    });
  });

  it("checks addresses before deleting server1", () => {
    expect(server.clusterAddresses()).toEqual([server.address()]);
  });
});

afterAll(after);
