import {
  before,
  after,
  defaultCluster as servers,
  waitForConsistentState,
  wait,
  addNodeToDefaultCluster,
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

  const count = 10;
  it(`create ${count} distinct sticky subscriptions and send one message to each to creat sticky routing state on servers[0]`, async () => {
    clients.push(servers[0].client());
    clients.push(servers[1].client());
    for (let i = 0; i < count; i++) {
      await clients[1].subscribe(`subject.${i}.*`, {
        queue: STICKY_QUEUE_GROUP,
      });
      // wait so above subscription is known to *both* servers:
      // @ts-ignore
      await servers[0].waitForInterest(
        `subject.${i}.0`,
        5000,
        clients[0].conn.id,
      );
      await clients[0].subscribe(`subject.${i}.*`, {
        queue: STICKY_QUEUE_GROUP,
      });
      // cause choice to be made and saved on servers[0]
      await clients[0].publish(`subject.${i}.foo`);
    }
  });

  it(`sticky on servers[0] should have ${count} entries starting in "subject".`, async () => {
    const v = Object.keys(servers[0].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(count);
  });

  it.skip(`sticky on servers[1] should have no entries starting in "subject".`, async () => {
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
      console.log(servers[1].sticky);
    }
  });

  it(`sticky on servers[1] should STILL have no entries starting in "subject", since no choices had to be made`, async () => {
    const v = Object.keys(servers[1].sticky).filter((s) =>
      s.startsWith("subject."),
    );
    expect(v.length).toBe(0);
  });
});

afterAll(after);
