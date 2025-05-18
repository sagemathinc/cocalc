import { getPort } from "@cocalc/server/nats/test/util";
import { initConatServer } from "@cocalc/server/nats/socketio";
import { connect as connect0 } from "@cocalc/backend/nats/conat";
import { delay } from "awaiting";
import { wait } from "@cocalc/server/nats/test/util";

describe("create server *after* client and ensure connects properly", () => {
  const path = "/conat";

  let port;
  it("selects a port", async () => {
    port = await getPort();
  });

  let cn;
  it("starts a client connecting to that port, despite there being no server yet", async () => {
    cn = connect0(`http://localhost:${port}`, {
      path,
      reconnectionDelay: 25, // fast for tests
      randomizationFactor: 0,
    });
    await delay(20);
    expect(cn.conn.connected).toBe(false);
  });

  let server;
  it("create a server", async () => {
    server = await initConatServer({ port, path });
  });

  it("now client should connect", async () => {
    await cn.waitUntilConnected();
    expect(cn.conn.connected).toBe(true);
  });

  it("close server and observe client disconnect", async () => {
    server.close();
    await wait({ until: () => !cn.conn.connected });
    expect(cn.conn.connected).toBe(false);
  });

  it("create server again and observe client connects again", async () => {
    server = await initConatServer({ port, path });
    await wait({ until: () => cn.conn.connected });
    expect(cn.conn.connected).toBe(true);
  });

  it("clean up", () => {
    server.close();
    cn.close();
  });
});
