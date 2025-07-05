/*

pnpm test `pwd`/converge.test.ts


*/

import {
  before,
  after,
  waitForConsistentState,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { createClusterNode } from "./util";

beforeAll(before);

const TIMEOUT = 30_000;
jest.setTimeout(TIMEOUT);

const clusterSize = 8;
describe(`explicitly build a cluster with ${clusterSize} nodes and ensure state converges`, () => {
  const servers: any[] = [],
    clients: any[] = [];
  it(`create ${clusterSize} distinct servers with cluster support enabled`, async () => {
    for (let i = 0; i < clusterSize; i++) {
      const { server, client } = await createClusterNode({
        clusterName: "my-cluster",
        id: `node-${i}`,
      });
      expect(server.options.id).toBe(`node-${i}`);
      expect(server.options.clusterName).toBe("my-cluster");
      servers.push(server);
      clients.push(client);
    }
  });

  it("link them all together in a complete digraph", async () => {
    for (let i = 0; i < servers.length; i++) {
      for (let j = 0; j < servers.length; j++) {
        if (i != j) {
          await servers[i].join(servers[j].address());
          await servers[j].join(servers[i].address());
        }
      }
    }
  });

  it("check that interest data is *eventually* consistent", async () => {
    await waitForConsistentState(servers, TIMEOUT);
  });
  
  it("check again that interest data is *eventually* consistent", async () => {
    await delay(1000);
    await waitForConsistentState(servers, TIMEOUT);
  });
});

afterAll(after);
