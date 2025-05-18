/*
Very basic test of conats core client and server.
*/

import { getPort, wait } from "@cocalc/server/nats/test/util";
import { initConatServer } from "@cocalc/server/nats/socketio";
import { connect } from "@cocalc/backend/nats/conat";

let server;
let port;
let address;

beforeAll(async () => {
  port = await getPort();
  address = `http://localhost:${port}`;
  server = await initConatServer({ port });
});

describe("connect to the server from a client", () => {
  it("creates a client and confirm it connects", async () => {
    const cn = connect(address);
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
    cn.close();
    expect(cn.conn.connected).toBe(false);
  });

  it("creates a client and waits for the info field to get set", async () => {
    const cn = connect(address);
    await wait({ until: () => cn.info != null });
    expect(cn.info?.max_payload).toBeGreaterThan(10000);
    cn.close();
  });
});

afterAll(async () => {
  await server.close();
});
