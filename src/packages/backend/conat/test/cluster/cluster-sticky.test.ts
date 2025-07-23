import {
  before,
  after,
  wait,
  waitForConsistentState,
} from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import { type ConatServer } from "@cocalc/conat/core/server";
import { createClusterNode } from "./util";

beforeAll(before);

describe("create cluster of two nodes, and verify that *sticky* subs properly work", () => {
  let server1: ConatServer, server2: ConatServer, client1, client1b, client2;
  it("create two distinct servers and link them", async () => {
    ({ server: server1, client: client1 } = await createClusterNode({
      clusterName: "cluster0",
      id: "1",
      autoscanInterval: 100,
      longAutoscanInterval: 1000,
    }));
    client1b = server1.client();
    ({ server: server2, client: client2 } = await createClusterNode({
      clusterName: "cluster0",
      id: "2",
      autoscanInterval: 100,
      longAutoscanInterval: 1000,
    }));
    await server1.join(server2.address());
    await server2.join(server1.address());
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
    // NOTE: if we do this test without waiting for consistent state, it will definitely
    // fail sometimes, since server2 literally doesn't know enough about the servers yet,
    // so has to make a different choice.  Services of course must account for the fact that
    // for the first moments of their existence, sticky routing can't work.
    await waitForConsistentState([server1, server2]);

    await client2.waitForInterest(subject);
    for (let i = 0; i < count; i++) {
      await client2.publish(subject, "hi");
    }
    await wait({ until: () => recv1 + recv1b >= 2 * count });
    expect(recv1 + recv1b).toEqual(2 * count);
    expect(recv1 * recv1b).toEqual(0);
  });

  let server3, client3;
  it("add a third node", async () => {
    const { client, server } = await createClusterNode({
      clusterName: "cluster0",
      autoscanInterval: 100,
      longAutoscanInterval: 5000,
      id: "3",
    });
    server3 = server;
    client3 = client;
    await server1.join(server.address());
  });

  it("waits for consistent state -- this verifies, e.g., that sticky state is equal", async () => {
    await waitForConsistentState([server1, server2, server3]);
  });

  it("client connected to server3 also routes properly", async () => {
    const total = recv1 + recv1b;
    await client3.waitForInterest(subject);
    for (let i = 0; i < count; i++) {
      await client3.publish(subject, "hi");
    }
    await wait({ until: () => recv1 + recv1b >= total + count });
    expect(recv1 + recv1b).toEqual(total + count);
    expect(recv1 * recv1b).toEqual(0);
  });

  it("client1 and client2 still route properly", async () => {
    const total = recv1 + recv1b;
    for (let i = 0; i < count; i++) {
      await client1.publish(subject, "hi");
      await client2.publish(subject, "hi");
    }
    await wait({ until: () => recv1 + recv1b >= total + 2 * count });
    expect(recv1 + recv1b).toEqual(total + 2 * count);
    expect(recv1 * recv1b).toEqual(0);
  });
});

afterAll(after);
