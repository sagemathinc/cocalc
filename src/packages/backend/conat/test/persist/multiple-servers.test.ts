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
import { uuid } from "@cocalc/util/misc";

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
  const projects: string[] = [];
  it(`creates ${count} persist clients`, async () => {
    const ids = new Set<string>([]);
    for (let i = 0; i < count; i++) {
      const client = connect();
      const project_id = uuid();
      projects.push(project_id);
      const persistClient = stream({
        client,
        user: { project_id },
        storage: { path: `projects/${project_id}/foo-${i}` },
      });
      ids.add(await persistClient.serverId());
      persistClients.push(persistClient);
      const { seq } = await persistClient.set({
        messageData: messageData(i, { headers: { [i]: i } }),
      });
      expect(seq).toBe(1);
    }
    // given that we're randomly distributing so many clients (what really matters
    // is the user field above)
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

  it("new clients use exactly the same servers, since the assignment was already made above", async () => {
    const ids = new Set<string>([]);
    for (let i = 0; i < count; i++) {
      const client = connect();
      const project_id = projects[i];
      const persistClient = stream({
        client,
        user: { project_id },
        storage: { path: `projects/${project_id}/foo-${i}` },
      });
      ids.add(await persistClient.serverId());
      persistClients.push(persistClient);
      const { seq } = await persistClient.set({
        messageData: messageData(i, { headers: { [i]: i } }),
      });
      expect(seq).toBe(2);
    }
    expect(ids.size).toBe(numServers);
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
