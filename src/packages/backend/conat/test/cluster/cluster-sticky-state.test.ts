/*
import {
  before,
  after,
  defaultCluster as servers,
  waitForConsistentState,
  wait,
  addNodeToDefaultCluster,
} from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import { randomId } from "@cocalc/conat/names";

beforeAll(before);

describe("ensure sticky state sync and use is working properly", () => {
  let clients: any;
  it("2-node cluster", async () => {
    await addNodeToDefaultCluster();
    expect(servers.length).toBe(2);
    await waitForConsistentState(servers);
    clients = servers.map((x) => x.client());
  });

  const count = 25;
  const subs0: any[] = [];
  const subs1: any[] = [];
  it(`create ${count} distinct sticky subscriptions and send one message to each to create sticky routing state on servers[0]`, async () => {
    clients.push(servers[0].client());
    clients.push(servers[1].client());
    for (let i = 0; i < count; i++) {
      subs0.push(
        await clients[1].subscribe(`subject.${i}.*`, {
          queue: STICKY_QUEUE_GROUP,
        }),
      );
      // wait so above subscription is known to *both* servers:
      // @ts-ignore
      await servers[0].waitForInterest(
        `subject.${i}.0`,
        5000,
        clients[0].conn.id,
      );
      subs1.push(
        await clients[0].subscribe(`subject.${i}.*`, {
          queue: STICKY_QUEUE_GROUP,
        }),
      );
      // publishing causes a choice to be made and saved on servers[0]
      await clients[0].publish(`subject.${i}.foo`, "hello");
      expect(servers[0].sticky[`subject.${i}.*`]).not.toBe(undefined);
      // but no choice on servers[1]
      expect(servers[1].sticky[`subject.${i}.*`]).toBe(undefined);
    }
  });

  let chosen;
  it("see which subscription got chosen for subject.0.* -- this is useful later", async () => {
    const p0 = async () => {
      await subs0[0].next();
      return 0;
    };
    const p1 = async () => {
      await subs1[0].next();
      return 1;
    };
    chosen = await Promise.race([p0(), p1()]);
  });

  it(`sticky on servers[0] should have ${count} entries starting in "subject".`, async () => {
    const v = Object.keys(servers[0].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(count);
  });

  it(`sticky on servers[1] should have no entries starting in "subject".`, async () => {
    const v = Object.keys(servers[1].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(0);
  });

  it(`servers[1]'s link to servers[0] should *eventually* have ${count} entries starting in "subject."`, async () => {
    // @ts-ignore
    const link = servers[1].clusterLinksByAddress[servers[0].address()];
    let v;
    await wait({
      until: () => {
        v = Object.keys(link.sticky).filter((s) => s.startsWith("subject."));
        return v.length == count;
      },
    });
    expect(v.length).toBe(count);
  });

  it("send message from clients[1] to each subject", async () => {
    for (let i = 0; i < count; i++) {
      await clients[1].publish(`subject.${i}.foo`);
    }
  });

  // Sometimes this fails under very heavy load.
  // It's not a good test, because it probably hits some timeouts sometimes, and
  // it is testing internal structure/optimizations, not behavior.
  // Note also that minimizing sticky state computation is just an optimization so even if this test were failing
  // due to a bug, it might just mean things are slightly slower.
  //   it(`sticky on servers[1] should STILL have no entries starting in "subject", since no choices had to be made`, async () => {
  //     const v = Object.keys(servers[1].sticky).filter((s) =>
  //       s.startsWith("subject."),
  //     );
  //     expect(v.length).toBe(0);
  //   });

  async function deliveryTest() {
    const sub = chosen == 0 ? subs0[0] : subs1[0];

    // clear up the subscription (we sent it stuff above)
    const sentinel = randomId();
    await clients[0].publish("subject.0.foo", sentinel);
    while (true) {
      const { value } = await sub.next();
      if (value.data == sentinel) {
        break;
      }
    }
    for (const server of servers) {
      // we randomize the last segment to verify that it is NOT used
      // as input to the sticky routing choice.
      const { count } = await server
        .client()
        .publish(`subject.0.${randomId()}`, "delivery-test");
      expect(count).toBe(1);
    }
    const ids = new Set<string>();
    for (let i = 0; i < servers.length; i++) {
      // on of the subs will receive it and one will hang forever (which is fine)
      const { value } = await sub.next();
      expect(value.data).toBe("delivery-test");
      ids.add(value.client.id);
    }
    // all messages must go to the SAME subscriber, since sticky
    expect(ids.size).toBe(1);
  }

  it("publish from every node to subject.0.foo", deliveryTest);

  const count2 = 5;
  it(`add ${count2} more nodes to the cluster should be reaonably fast and not blow up in a feedback loop`, async () => {
    for (let i = 0; i < count2; i++) {
      await addNodeToDefaultCluster();
    }
  });

  it("wait until cluster is consistent", async () => {
    await waitForConsistentState(servers);
  });

  it("double check the links have the sticky state", () => {
    for (const server of servers.slice(1)) {
      // @ts-ignore
      const link = server.clusterLinksByAddress[servers[0].address()];
      const v = Object.keys(link.sticky).filter((s) =>
        s.startsWith("subject."),
      );
      expect(v.length).toBe(count);
    }
  });

  it(
    "in bigger, cluster, publish from every node to subject.0.foo",
    deliveryTest,
  );

  it("listen on > and note that it doesn't impact the count", async () => {
    const sub = await clients[0].subscribe(">");
    for (let i = 0; i < servers.length; i++) {
      const { count } = await servers[i]
        .client()
        .publish("subject.0.foo", "hi");
      expect(count).toBe(1);
    }
    sub.close();
  });

  it("unjoining servers[0] from servers[1] should transfer the sticky state to servers[1]", async () => {
    await servers[1].unjoin({ address: servers[0].address() });
    const v = Object.keys(servers[1].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(count);
  });
});

afterAll(after);
*/
