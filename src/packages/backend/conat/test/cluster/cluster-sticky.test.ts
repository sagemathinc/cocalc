import { before, after, wait } from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import { createClusterNode } from "./util";

beforeAll(before);

describe("create cluster of two nodes, and verify that *sticky* subs properly work", () => {
  let server1, server2, client1, client1b, client2;
  it("create two distinct servers and link them", async () => {
    ({ server: server1, client: client1 } = await createClusterNode({
      clusterName: "cluster0",
      id: "1",
      systemAccountPassword: "squeamish",
    }));
    client1b = server1.client();
    ({ server: server2, client: client2 } = await createClusterNode({
      clusterName: "cluster0",
      id: "2",
      systemAccountPassword: "ossifrage",
    }));
    await server1.addClusterLink(client2);
    await server2.addClusterLink(client1);
  });

  let sub1, sub1b;
  let recv1 = 0,
    recv1b = 0;
  const subject = "5077.org";
  it("make two subscriptions with the same sticky queue group", async () => {
    sub1 = await client1.sub(subject, { queue: STICKY_QUEUE_GROUP });
    (async () => {
      for await (const _ of sub1) {
        recv1++;
      }
    })();
    sub1b = await client1b.sub(subject, { queue: STICKY_QUEUE_GROUP });
    (async () => {
      for await (const _ of sub1b) {
        recv1b++;
      }
    })();
  });

  let count = 50;
  it("send messages and note they all go to the same target -- first the easy sanity check all on the same node", async () => {
    await client1.waitForInterest(subject);
    for (let i = 0; i < count; i++) {
      await client1.publish(subject, "hi");
    }
    await wait({ until: () => recv1 + recv1b >= count });
    expect(recv1 + recv1b).toEqual(count);
    expect(recv1 * recv1b).toEqual(0);
  });

  it("send messages and note they all go to the same target -- next the hard case across the cluster", async () => {
    await client2.waitForInterest(subject);
    for (let i = 0; i < count; i++) {
      await client2.publish(subject, "hi");
    }
    await wait({ until: () => recv1 + recv1b >= 2 * count });
    expect(recv1 + recv1b).toEqual(2 * count);
    expect(recv1 * recv1b).toEqual(0);
  });
});

afterAll(after);
