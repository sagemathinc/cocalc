/*
pnpm test `pwd`/pubsub.test.ts
*/

import {
  before,
  after,
  server,
  addNodeToDefaultCluster,
  wait,
  delay,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("the most basic pub/sub test with a 2-node cluster", () => {
  let client0, server1, client1;
  it("add another node to cluster", async () => {
    client0 = server.client();
    server1 = await addNodeToDefaultCluster();
    client1 = server1.client();
  });

  let sub;
  it("subscribe", async () => {
    sub = await client0.subscribe("cocalc");
  });

  // commenting this out, since it is impossible to robustly test in all cases,
  // since sometmes the subscription info can move very quickly and this publish
  // could be slow!
  //   it("publish -- message is initially dropped with no receiver because interest doesn't propogate instantly", async () => {
  //     const { count } = await client1.publish("cocalc", "hi");
  //     expect(count).toBe(0);
  //   });

  it("publish after waiting for interest -- this works", async () => {
    await client1.waitForInterest("cocalc");
    const { count, bytes } = await client1.publish("cocalc", "hi");
    expect(count).toBe(1);
    expect(bytes).toBe(3);
  });

  it("receive", async () => {
    const { value } = await sub.next();
    expect(value.data).toBe("hi");
  });

  it("clean up", () => {
    sub.close();
  });
});

describe("same basic test, but in the other direction", () => {
  let client0, client1;
  it("get the clients", async () => {
    client0 = server.client();
    // @ts-ignore
    client1 = Object.values(server.clusterLinks[server.clusterName])[0].client;
  });

  let sub;
  it("subscribe", async () => {
    sub = await client1.subscribe("conat");
  });

  it("publish after waiting for interest -- this works", async () => {
    await client0.waitForInterest("conat");
    const { count, bytes } = await client0.publish("conat", "hi");
    expect(count).toBe(1);
    expect(bytes).toBe(3);
  });

  it("receive", async () => {
    const { value } = await sub.next();
    expect(value.data).toBe("hi");
  });

  it("clean up", () => {
    sub.close();
  });
});

describe("three nodes and two subscribers with different queue group on distinct nodes", () => {
  let client0, client1, client2, server2;
  it("get the clients", async () => {
    client0 = server.client();
    // @ts-ignore
    client1 = Object.values(server.clusterLinks[server.clusterName])[0].client;
    server2 = await addNodeToDefaultCluster();
    client2 = server2.client();
  });

  let sub0, sub1;
  it("subscribes from two nodes", async () => {
    sub0 = await client0.subscribe("sage", { queue: "0" });
    sub1 = await client1.subscribe("sage", { queue: "1" });
  });

  it("only way to be sure to get both is to just try -- different queue group so eventually there will be two receivers", async () => {
    await wait({
      until: async () => {
        const { count } = await client2.publish("sage", "hi");
        return count == 2;
      },
    });
    // and check both got something
    await sub0.next();
    await sub1.next();
  });

  it("subscribe from two nodes but with same queue group so only one subscriber will get it", async () => {
    sub0 = await client0.subscribe("math", { queue: "0" });
    sub1 = await client1.subscribe("math", { queue: "0" });
    await client2.waitForInterest("math");
    await delay(250);
    const { count } = await client2.publish("math", "hi");
    expect(count).toBe(1);
  });
});

afterAll(after);
