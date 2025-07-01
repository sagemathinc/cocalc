/*
pnpm test `pwd`/cluster.test.ts

*/

import { after, before, server, addNodeToDefaultCluster, wait } from "../setup";

beforeAll(before);

describe("using various sync data structures with a cluster", () => {
  let client, dstream;
  it("creates a dstream", async () => {
    client = server.client();
    dstream = await client.sync.dstream({ name: "foo" });
    expect(dstream.getAll()).toEqual([]);

    dstream.publish("hi");
    await dstream.save();
  });

  let server2, client2, dstream2;
  it("creates another node and a second client connected to the same dstream, and observe it works", async () => {
    server2 = await addNodeToDefaultCluster();
    client2 = server2.client();
    expect(server2.options.port).not.toBe(server.options.port);

    dstream2 = await client2.sync.dstream({ name: "foo", noCache: true });
    expect(dstream === dstream2).toBe(false);
    expect(dstream2.getAll()).toEqual(["hi"]);

    dstream2.publish("world");
    //expect(dstream2.getAll()).toEqual(["hi", "world"]);
    // not instant
    expect(dstream.getAll()).toEqual(["hi"]);
    await wait({ until: () => dstream.length == 2 });
  });
});

afterAll(after);
