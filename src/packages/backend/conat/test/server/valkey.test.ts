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

beforeAll(before);

describe("create two conat socket servers NOT connected via a valkey stream, and observe this is totally broken", () => {
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
    server2 = await initConatServer({ valkey });
    expect(server1.options.port).not.toEqual(server2.options.port);
  });

  let client1;
  let client2;
  let sub1;
  const SUBJECT = "my-subject.org";
  const SUBJECT2 = "my-subject2.org";
  it("observe client connected to each server and CAN communicate with each other via pub/sub", async () => {
    client1 = server1.client();
    client2 = server2.client();
    sub1 = await client1.subscribe(SUBJECT);
    expect(Object.keys(server1.interest.patterns)).toContain(SUBJECT);
    expect(Object.keys(server2.interest.patterns)).toContain(SUBJECT);
    client2.publish(SUBJECT, "from client 2");
    const { value } = await sub1.next();
    expect(value.data).toBe("from client 2");

    const sub2 = await client2.subscribe(SUBJECT2);
    client1.publish(SUBJECT2, "hi from client 1");
    const { value: value2 } = await sub2.next();
    expect(value2.data).toBe("hi from client 1");
  });

  it("client unsubscribes and that is reflected immediately in the other server", async () => {
    sub1.close();
    await wait({
      until: () => {
        return server1.interest.patterns[SUBJECT] == null;
      },
    });
    expect(Object.keys(server1.interest.patterns)).not.toContain(SUBJECT);
    expect(Object.keys(server2.interest.patterns)).not.toContain(SUBJECT);
  });

  const count = 1000;
  let server3;
  it(`one client subscribes to ${count} distinct subjects and these are all visible in the other servers -- all messages get routed properly when sent to all subjects`, async () => {
    server3 = await initConatServer({ valkey });
    const v: any[] = [];
    for (let i = 0; i < count; i++) {
      v.push(client1.subscribe(`subject.${i}`));
    }
    const subs = await Promise.all(v);

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
  });

  it("cleans up", () => {
    valkeyServer.close();
    client1.close();
    client2.close();
    server1.close();
    server2.close();
  });
});

afterAll(after);
