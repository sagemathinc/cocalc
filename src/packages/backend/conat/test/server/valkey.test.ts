/*
Test using socket servers connected via valkey.
*/

import {
  before,
  after,
  client,
  server,
  initConatServer,
  delay,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("create two conat socket servers NOT connected via a valkey stream, and observe this is totally broken", () => {
  let server2;
  it("creates a second server", async () => {
    server2 = await initConatServer();
    expect(server.options.port).not.toEqual(server2.options.port);
  });

  let client2;
  it("observe client connected to each server CANT communicate", async () => {
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

describe.skip("do the same setup as above with two servers, but connected via valkey, and see that they do communicate", () => {
  let server1, server2;
  it("creates valkey and two servers", async () => {
    server1 = await initConatServer({ valkey: "valkey://127.0.0.1:6379" });
    server2 = await initConatServer({ valkey: "valkey://127.0.0.1:6379" });
    expect(server1.options.port).not.toEqual(server2.options.port);
  });

  let client1;
  let client2;
  it("observe client connected to each server CAN communicate", async () => {
    client1 = server1.client();
    client2 = server2.client();
    const sub = await client1.subscribe("subject");
    // this will never be seen by client:
    client2.publish("subject", "from client 2");
    await delay(1500);
    console.log(server1.interest);
    console.log(server2.interest);
    //client1.publish("subject", "from client 1");
    const { value } = await sub.next();
    expect(value.data).toBe("from client 2");
    //expect(value.data).toBe("from client 1");
  });

  it("cleans up", () => {
    client1.close();
    client2.close();
    server1.close();
    server2.close();
  });
});

afterAll(after);
