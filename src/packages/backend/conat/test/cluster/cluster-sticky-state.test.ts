import {
  before,
  after,
  defaultCluster as servers,
  waitForConsistentState,
  wait,
  addNodeToDefaultCluster,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";

beforeAll(before);

describe("ensure sticky state sync and use is working properly", () => {
  let clients: any;
  it("2-node cluster", async () => {
    await addNodeToDefaultCluster();
    expect(servers.length).toBe(2);
    await waitForConsistentState(servers);
    clients = servers.map((x) => x.client());
  });

  const count = 1;
  const subs0: any[] = [];
  const subs1: any[] = [];
  it(`create ${count} distinct sticky subscriptions and send one message to each to creat sticky routing state on servers[0]`, async () => {
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

  it(`sticky on servers[1] should STILL have no entries starting in "subject", since no choices had to be made`, async () => {
    const v = Object.keys(servers[1].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(0);
  });

  async function deliveryTest() {
    for (const server of servers) {
      const { count } = await server.client().publish("subject.0.foo", "hello");
      expect(count).toBe(1);
    }
    const ids: string[] = [];
    for (let i = 0; i < servers.length; i++) {
      // on of the subs will receive it and one will hang forever (which is fine)
      const { value } = await Promise.race([subs0[0].next(), subs1[0].next()]);
      console.log(i, value.data);
      expect(value.data).toBe("hello");
      ids.push(value.client.id);
    }
    // all messages must go to the SAME sub, since sticky
    expect(ids.length).toBe(1);
  }

  it("publish from every node to subject.0.foo", deliveryTest);

  it.skip("unjoining servers[0] from servers[1] should transfer the sticky state to servers[1]", async () => {
    await servers[1].unjoin({ address: servers[0].address() });
    const v = Object.keys(servers[1].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(count);
  });

  it("rejoin node to cluster", async () => {
    await servers[1].join(servers[0].address());
    await waitForConsistentState(servers);
  });

  const count2 = 5;
  it.skip(`add ${count2} more nodes to the cluster should be reaonably fast and not blow up in a feedback loop`, async () => {
    for (let i = 0; i < count2; i++) {
      await addNodeToDefaultCluster();
    }
    await waitForConsistentState(servers);
  });

  it.skip("double check the links have the sticky state", () => {
    for (const server of servers.slice(1)) {
      const link = server.clusterLinksByAddress[servers[0].address()];
      const v = Object.keys(link.sticky).filter((s) =>
        s.startsWith("subject."),
      );
      expect(v.length).toBe(count);
    }
  });

  it.skip("in bigger, cluster, publish from every node to subject.0.foo", async () => {
    for (const server of servers) {
      await server.client().publish("subject.0.foo", "hello");
    }
    const ids: string[] = [];
    for (const _ of servers) {
      const { value } = await Promise.race([subs0[0].next(), subs1[0].next()]);
      console.log(value.data);
      //expect(value.data).toBe("hello");
      ids.push(value.client.id);
    }
    // all messages must go to same sub, since sticky
    expect(ids.length).toBe(1);
  });
});

afterAll(after);
