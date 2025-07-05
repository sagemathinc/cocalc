/*
Stress test pub/sub in various settings:

- single server
- multiple servers 
- multiple servers with a sticky subscription
- multiple servers with 800 existing subscriptions

The goal is just to make sure there are no ridiculous performance regressions.
Also, this is a useful file to play around with to understand the speed
we should expect sending simple messages. It's basically

pnpm test `pwd`/pubsub.test.ts

*/

import {
  before,
  after,
  initConatServer,
  createConatCluster,
  client,
} from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import { waitForSubscription } from "./util";

// should be several thousand, so 250 seems reasonable as a cutoff to indicate
// things are horribly wrong
const REQUIRED_SINGLE_SERVER_RECV_MESSAGES_PER_SECOND = 250;
// should be tens of thousands
const REQUIRED_SINGLE_SERVER_SEND_MESSAGES_PER_SECOND = 500;

const REQUIRED_CLUSTER_SERVER_RECV_MESSAGES_PER_SECOND = 200;
const REQUIRED_CLUSTER_SERVER_SEND_MESSAGES_PER_SECOND = 400;

const VERBOSE = false;
const log = VERBOSE ? console.log : (..._args) => {};

beforeAll(before);

jest.setTimeout(15000);

describe("the most basic pub/sub test", () => {
  let sub;
  it("subscribe", async () => {
    sub = await client.subscribe("cocalc");
  });

  it("publish", async () => {
    const { count, bytes } = await client.publish("cocalc", "hi");
    expect(bytes).toBe(3);
    expect(count).toBe(1);
  });

  it("receive", async () => {
    const { value } = await sub.next();
    expect(value.data).toBe("hi");
  });

  it("clean up", () => {
    sub.close();
  });
});

describe("create two connected servers and two clients and test messaging speed", () => {
  let server, client1, client2;
  it("one server and two clients connected to it", async () => {
    server = await initConatServer();
    client1 = server.client();
    client2 = server.client();
  });

  const count1 = 1000;
  it(`do a benchmark with a single server of send/receiving ${count1} messages`, async () => {
    const sub = await client1.subscribe("bench");
    await waitForSubscription(server, "bench");
    const f = async () => {
      const start = Date.now();
      let i = 0;
      for await (const _ of sub) {
        i += 1;
        if (i >= count1) {
          return Math.ceil((count1 / (Date.now() - start)) * 1000);
        }
      }
    };
    const start = Date.now();
    for (let i = 0; i < count1; i++) {
      client2.publishSync("bench", null);
    }
    const sendRate = Math.ceil((count1 / (Date.now() - start)) * 1000);
    log("sent", sendRate, "messages per second");
    expect(sendRate).toBeGreaterThan(
      REQUIRED_SINGLE_SERVER_SEND_MESSAGES_PER_SECOND,
    );
    const recvRate = await f();
    log("received ", recvRate, "messages per second");
    expect(recvRate).toBeGreaterThan(
      REQUIRED_SINGLE_SERVER_RECV_MESSAGES_PER_SECOND,
    );
  });
});

describe("benchmarking bigger send/receives", () => {
  const count = 500;
  it(`do a benchmark of cluster send/receiving ${count} messages`, async () => {
    const servers = await createConatCluster(2);
    return;
    const [server1, server2] = Object.values(servers);
    const client1 = server1.client();
    const client2 = server2.client();
    const sub = await client1.subscribe("bench");
    await waitForSubscription(server1, "bench");
    await waitForSubscription(server2, "bench");
    const f = async () => {
      const start = Date.now();
      let i = 0;
      for await (const _ of sub) {
        i += 1;
        if (i >= count) {
          return Math.ceil((count / (Date.now() - start)) * 1000);
        }
      }
    };
    const start = Date.now();
    for (let i = 0; i < count; i++) {
      client2.publishSync("bench", null);
    }
    const sendRate = Math.ceil((count / (Date.now() - start)) * 1000);
    log("sent", sendRate, "messages per second");
    if (count > 10) {
      expect(sendRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_SEND_MESSAGES_PER_SECOND,
      );
    }
    const recvRate = await f();
    log("received ", recvRate, "messages per second");
    if (count > 10) {
      expect(recvRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_RECV_MESSAGES_PER_SECOND,
      );
    }
  });

  it(`do a benchmark of send/receiving and STICKY SUB involving ${count} messages`, async () => {
    const servers = await createConatCluster(2);
    const [server1, server2] = Object.values(servers);
    const client1 = server1.client();
    const client2 = server2.client();
    const sub = await client1.subscribe("bench", { queue: STICKY_QUEUE_GROUP });
    await waitForSubscription(server1, "bench");
    await waitForSubscription(server2, "bench");
    const f = async () => {
      const start = Date.now();
      let i = 0;
      log(`sticky cluster: receiving ${count} messages`);
      for await (const _ of sub) {
        i += 1;
        if (i >= count) {
          return Math.ceil((count / (Date.now() - start)) * 1000);
        }
      }
    };
    const start = Date.now();
    log(`sticky cluster: sending ${count} messages`);
    for (let i = 0; i < count; i++) {
      client2.publishSync("bench", null);
    }
    const sendRate = Math.ceil((count / (Date.now() - start)) * 1000);
    log("sticky cluster: sent", sendRate, "messages per second");
    if (count > 10) {
      expect(sendRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_SEND_MESSAGES_PER_SECOND,
      );
    }
    const recvRate = await f();
    log("sticky cluster: received ", recvRate, "messages per second");
    if (count > 10) {
      expect(recvRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_RECV_MESSAGES_PER_SECOND,
      );
    }
  });
});

describe("benchmarking with many random subscriptions", () => {
  const subcount = 400;
  const count = 500;
  it(`do a benchmark with cluster of send/receiving and ${count} messages after adding ${subcount} random subscriptions per client`, async () => {
    const servers = await createConatCluster(2);
    const [server1, server2] = Object.values(servers);
    const client1 = server1.client();
    const client2 = server2.client();

    log("creating subscriptions");
    const v: any[] = [];
    for (let i = 0; i < subcount; i++) {
      v.push(await client1.subscribe(`bench.one.${i}`));
      v.push(await client2.subscribe(`bench.two.${i}`));
    }
    log("waiting for subscriptions");
    await waitForSubscription(server1, `bench.one.${subcount - 1}`);
    await waitForSubscription(server2, `bench.two.${subcount - 1}`);

    const sub = await client1.subscribe("bench");
    await waitForSubscription(server1, "bench");
    await waitForSubscription(server2, "bench");
    const f = async () => {
      const start = Date.now();
      let i = 0;
      for await (const _ of sub) {
        i += 1;
        if (i >= count) {
          return Math.ceil((count / (Date.now() - start)) * 1000);
        }
      }
    };
    const start = Date.now();
    for (let i = 0; i < count; i++) {
      client2.publishSync("bench", null);
    }
    const sendRate = Math.ceil((count / (Date.now() - start)) * 1000);
    log("many subs + cluster: sent", sendRate, "messages per second");
    if (count > 10) {
      expect(sendRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_SEND_MESSAGES_PER_SECOND,
      );
    }
    log(`many subs + cluster: receiving ${count} messages`);
    const recvRate = await f();
    log("many subs + cluster: received ", recvRate, "messages per second");
    if (count > 10) {
      expect(recvRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_RECV_MESSAGES_PER_SECOND,
      );
    }
  });
});

describe("benchmarking with many servers", () => {
  const clusterSize = 4;
  const subcount = 400;
  const count = 500;
  let clients, servers;
  it(`do a benchmark with cluster of send/receiving and ${count} messages after adding ${subcount} random subscriptions per client`, async () => {
    servers = Object.values(await createConatCluster(clusterSize));
    clients = servers.map((server) => server.client());

    const v: any[] = [];
    for (let i = 0; i < subcount; i++) {
      for (const client of clients) {
        v.push(await client.subscribe(`bench.${client.id}.${i}`));
      }
    }
    for (let i = 0; i < clusterSize; i++) {
      await waitForSubscription(
        servers[i],
        `bench.${clients[i].id}.${subcount - 1}`,
      );
    }

    const sub = await clients[1].subscribe("bench");
    for (let i = 0; i < clusterSize; i++) {
      await waitForSubscription(servers[i], "bench");
    }
    const f = async () => {
      const start = Date.now();
      let i = 0;
      for await (const _ of sub) {
        i += 1;
        if (i >= count) {
          return Math.ceil((count / (Date.now() - start)) * 1000);
        }
      }
    };
    const start = Date.now();
    for (let i = 0; i < count / clients.length; i++) {
      for (let j = 0; j < clients.length; j++) {
        clients[j].publishSync("bench", null);
      }
    }
    const sendRate = Math.ceil((count / (Date.now() - start)) * 1000);
    log(
      `many subs + cluster of size ${clusterSize}: sent`,
      sendRate,
      "messages per second",
    );
    if (count > 10) {
      expect(sendRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_SEND_MESSAGES_PER_SECOND,
      );
    }
    log(`many subs + cluster: receiving ${count} messages`);
    const recvRate = await f();
    log(
      `many subs + cluster of size ${clusterSize}: received `,
      recvRate,
      "messages per second",
    );
    if (count > 10) {
      expect(recvRate).toBeGreaterThan(
        REQUIRED_CLUSTER_SERVER_RECV_MESSAGES_PER_SECOND,
      );
    }
  });
});

afterAll(after);
