/*
Test using socket servers connected via valkey.

pnpm test ./valkey.test.ts
*/

import {
  before,
  after,
  client,
  server,
  initConatServer,
  delay,
  runValkey,
  wait,
} from "@cocalc/backend/conat/test/setup";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import {
  waitForSubscription,
  waitForNonSubscription,
  waitForSticky,
} from "./util";

beforeAll(before);

jest.setTimeout(10000);

describe("create two conat socket servers NOT connected via a valkey stream, and observe communication is totally broken (of course)", () => {
  let server2;
  it("creates a second server", async () => {
    server2 = await initConatServer();
    expect(server.options.port).not.toEqual(server2.options.port);
  });

  let client2;
  it("observe client connected to each server CAN'T communicate", async () => {
    client2 = server2.client();
    const sub = await client.subscribe("subject");
    // this will never be seen by client:
    client2.publish("subject", "from client 2");
    await delay(500);
    // this does get seen by client
    client.publish("subject", "from client 1");
    const { value } = await sub.next();
    expect(value.data).toBe("from client 1");
  });

  it("cleans up", () => {
    client2.close();
    server2.close();
  });
});

describe("do the same setup as above with two servers, but connected via valkey, and see that they do communicate", () => {
  let server1, server2, valkey, valkeyServer;
  it("creates valkey and two servers", async () => {
    valkeyServer = await runValkey();
    valkey = valkeyServer.address;
    server1 = await initConatServer({ valkey });

    // configuration for valkey can also be given as a json string:
    server2 = await initConatServer({
      valkey: JSON.stringify({
        password: valkeyServer.password,
        port: valkeyServer.port,
      }),
    });
    expect(server1.options.port).not.toEqual(server2.options.port);
  });

  let client1;
  let client2;
  let sub1;
  const SUBJECT = "my-subject.org";
  const SUBJECT2 = "my-subject2.org";
  it("create client connected to each server and verify that they CAN communicate with each other via pub/sub", async () => {
    client1 = server1.client();
    client2 = server2.client();

    sub1 = await client1.subscribe(SUBJECT);
    await waitForSubscription(server2, SUBJECT);

    expect(Object.keys(server1.interest.patterns)).toContain(SUBJECT);
    expect(Object.keys(server2.interest.patterns)).toContain(SUBJECT);
    client2.publish(SUBJECT, "from client 2");
    const { value } = await sub1.next();
    expect(value.data).toBe("from client 2");

    const sub2 = await client2.subscribe(SUBJECT2);
    await waitForSubscription(server1, SUBJECT2);

    client1.publish(SUBJECT2, "hi from client 1");
    const { value: value2 } = await sub2.next();
    expect(value2.data).toBe("hi from client 1");
  });

  it("client unsubscribes and that is reflected in both servers", async () => {
    sub1.close();
    await waitForNonSubscription(server1, SUBJECT);
    await waitForNonSubscription(server2, SUBJECT);
    expect(Object.keys(server1.interest.patterns)).not.toContain(SUBJECT);
    expect(Object.keys(server2.interest.patterns)).not.toContain(SUBJECT);
  });

  const count = 450;
  let server3;
  it(`one client subscribes to ${count} distinct subjects and these are all visible in the other servers -- all messages get routed properly when sent to all subjects`, async () => {
    server3 = await initConatServer({ valkey });
    const v: any[] = [];
    let subj;
    for (let i = 0; i < count; i++) {
      subj = `subject.${i}`;
      v.push(client1.subscribe(subj));
    }
    const subs = await Promise.all(v);
    await waitForSubscription(server1, subj);
    await waitForSubscription(server2, subj);
    await waitForSubscription(server3, subj);

    for (let i = 0; i < count; i++) {
      expect(Object.keys(server1.interest.patterns)).toContain(`subject.${i}`);
      expect(Object.keys(server2.interest.patterns)).toContain(`subject.${i}`);
      expect(Object.keys(server3.interest.patterns)).toContain(`subject.${i}`);
    }

    // and they work:
    const p: any[] = [];
    const p2: any[] = [];
    for (let i = 0; i < count; i++) {
      p.push(client2.publish(`subject.${i}`, i));
      p2.push(subs[i].next());
    }
    await Promise.all(p);
    const result = await Promise.all(p2);
    for (let i = 0; i < count; i++) {
      expect(result[i].value.data).toBe(i);
    }

    // and can unsubscribe
    for (let i = 0; i < count; i++) {
      subs[i].close();
    }
    await waitForNonSubscription(server1, subj);
    await waitForNonSubscription(server2, subj);
    await waitForNonSubscription(server3, subj);
    for (let i = 0; i < count; i++) {
      expect(Object.keys(server1.interest.patterns)).not.toContain(
        `subject.${i}`,
      );
      expect(Object.keys(server2.interest.patterns)).not.toContain(
        `subject.${i}`,
      );
      expect(Object.keys(server3.interest.patterns)).not.toContain(
        `subject.${i}`,
      );
    }
  });

  it("cleans up", () => {
    valkeyServer.close();
    client1.close();
    client2.close();
    server1.close();
    server2.close();
  });
});

// this is very important, since the sticky resolution needs to be consistent
describe("create two servers connected via valkey, and verify that *sticky* subs properly work", () => {
  let server1, server2, valkey, valkeyServer, client1, client2;
  it("creates valkey, two servers and two clients", async () => {
    valkeyServer = await runValkey();
    valkey = valkeyServer.address;
    server1 = await initConatServer({ valkey });
    client1 = server1.client();
    server2 = await initConatServer({ valkey });
    client2 = server2.client();
  });

  let s1, s2, stickyTarget;
  const pattern = "sticky.io.*";
  it("setup a sticky server on both clients, then observe that its state is consistent", async () => {
    s1 = await client1.subscribe(pattern, { queue: STICKY_QUEUE_GROUP });
    s2 = await client2.subscribe(pattern, { queue: STICKY_QUEUE_GROUP });
    await waitForSubscription(server1, pattern);
    await waitForSubscription(server2, pattern);
    (async () => {
      for await (const x of s1) {
        x.respond("s1");
      }
    })();
    (async () => {
      for await (const x of s2) {
        x.respond("s2");
      }
    })();

    // we select a specific subject sticky.io.foo that matches the pattern :
    const x = await client1.request("sticky.io.foo", null);
    await waitForSticky(server1, "sticky.io.*");
    await waitForSticky(server2, "sticky.io.*");
    // this is the server it ended up hitting.
    stickyTarget = x.data;
    // check it still does
    for (let i = 0; i < 3; i++) {
      const y = await client1.request("sticky.io.foo", null);
      expect(y.data).toBe(stickyTarget);
    }
    await waitForSticky(server2, "sticky.io.*");
    // another client requesting sticky.io.foo even though a different
    // socketio conat server must get the same target:
    const z = await client2.request("sticky.io.foo", null);
    expect(z.data).toBe(stickyTarget);

    expect(server1.sticky).toEqual(server2.sticky);
    expect(server1.sticky[pattern] != null).toBe(true);
    // the last segment of the subject is discarded in the sticky choice:
    expect(server1.sticky[pattern]["sticky.io"] != null).toBe(true);
  });

  let server3, server4, client3;
  it("add new conat servers and observe sticky mapping is still the same so using shared  state instead of consistent hashing", async () => {
    server3 = await initConatServer({ valkey });
    server4 = await initConatServer({ valkey });
    await waitForSticky(server3, "sticky.io.*");
    await waitForSticky(server4, "sticky.io.*");
    await wait({
      until: () => {
        return (
          server3.sticky[pattern] != null && server4.sticky[pattern] != null
        );
      },
    });
    expect(server1.sticky).toEqual(server3.sticky);
    expect(server1.sticky).toEqual(server4.sticky);

    client3 = server3.client();
    const z = await client3.request("sticky.io.foo", null);
    expect(z.data).toBe(stickyTarget);
  });

  it("cleans up", () => {
    valkeyServer.close();
    client1?.close();
    client2?.close();
    client3?.close();
    server1?.close();
    server2?.close();
    server3?.close();
    server4?.close();
  });
});

afterAll(after);
