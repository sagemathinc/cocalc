/*
Unit tests of multiple persist servers at once:

- making numerous distinct clients and seeing that they are distributed across persist servers
- stopping a persist server and seeing that failover happens without data loss

pnpm test `pwd`/multiple-servers.test.ts 

*/

import {
  before,
  after,
  connect,
  persistServer as defaultPersistServer,
  once,
} from "@cocalc/backend/conat/test/setup";
import { stream } from "@cocalc/conat/persist/client";
import { delay } from "awaiting";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { messageData } from "@cocalc/conat/core/client";

beforeAll(before);

describe("multiple clients using multiple persist servers", () => {
  const persistServers: any[] = [];
  let numServers = 4;
  it(`ceate ${numServers} persist servers`, async () => {
    persistServers.push(defaultPersistServer);
    for (let i = 0; i < numServers - 1; i++) {
      const client = connect();
      const persistServer = createPersistServer({ client });
      await once(persistServer, "ready");
      persistServers.push(persistServer);
    }
  });

  let persistClients: any[] = [];
  let count = 50;
  it(`creates ${count} persist clients`, async () => {
    const ids = new Set<string>([]);
    for (let i = 0; i < count; i++) {
      const client = connect();
      const persistClient = stream({
        client,
        user: { hub_id: "x" },
        storage: { path: `hub/foo-${i}` },
      });
      ids.add(await persistClient.serverId());
      persistClients.push(persistClient);
      const { seq } = await persistClient.set({
        messageData: messageData(i, { headers: { [i]: i } }),
      });
      expect(seq).toBe(1);
    }
    // given that we're randomly distributing so many clients,
    // it's highly likely we hit all servers.
    expect(ids.size).toBe(persistServers.length);
  });

  it(`add ${numServers} more persist servers`, async () => {
    for (let i = 0; i < numServers - 1; i++) {
      const client = connect();
      const persistServer = createPersistServer({ client });
      await once(persistServer, "ready");
      persistServers.push(persistServer);
    }
  });

  it("read data we wrote above (so having new servers doesn't mess with existing connections)", async () => {
    for (let i = 0; i < count; i++) {
      const mesg = await persistClients[i].get({ seq: 1 });
      expect(mesg.data).toBe(i);
      expect(mesg.headers[`${i}`]).toBe(i);
    }
  });

  it("new clients use all the servers", async () => {
    const ids = new Set<string>([]);
    for (let i = 0; i < count; i++) {
      const client = connect();
      const persistClient = stream({
        client,
        user: { hub_id: "x" },
        storage: { path: `hub/foo-${count+i}` },
      });
      ids.add(await persistClient.serverId());
      persistClients.push(persistClient);
      const { seq } = await persistClient.set({
        messageData: messageData(i, { headers: { [i]: i } }),
      });
      expect(seq).toBe(1);
    }
    expect(ids.size).toBe(persistServers.length);
  });

  it("cleans up", () => {
    for (const client of persistClients) {
      client.close();
    }
    for (const server of persistServers) {
      server.close();
    }
  });
});

afterAll(async () => {
  // slight delay so all the sqlites of the persist servers can finish
  // writing to disk, so we can delete the temp directory
  await delay(100);
  await after();
});
