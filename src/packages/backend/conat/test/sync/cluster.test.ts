/*

pnpm test `pwd`/cluster.test.ts

*/

import {
  after,
  before,
  server,
  addNodeToDefaultCluster,
  wait,
  client,
  waitForConsistentState,
} from "../setup";

beforeAll(before);

jest.setTimeout(15000);

describe("using various sync data structures with a cluster", () => {
  let dstream;
  it("creates a dstream", async () => {
    dstream = await client.sync.dstream({ name: "foo" });
    expect(dstream.getAll()).toEqual([]);

    dstream.publish("hi");
    await dstream.save();
  });

  let server2, client2;
  it("creates another node", async () => {
    server2 = await addNodeToDefaultCluster();
    expect(server2.options.port).not.toBe(server.options.port);
    client2 = server2.client();
    expect(server2.options.port).not.toBe(server.options.port);
    expect(server2.clusterTopology()).toEqual(server.clusterTopology());
    expect(new Set(server2.clusterAddresses())).toEqual(
      new Set(server.clusterAddresses()),
    );
  });

  it("wait until both servers in the cluster have the same state", async () => {
    await waitForConsistentState([server, server2], 5000);
  });

  let dstream2;
  it("second client connected to the same dstream, and observe it works", async () => {
    dstream2 = await client2.sync.dstream({ name: "foo" });
    expect(dstream === dstream2).toBe(false);
    expect(dstream.opts.client.id).not.toEqual(dstream2.opts.client.id);
    expect(dstream2.getAll()).toEqual(["hi"]);

    dstream2.publish("world");
    expect(dstream2.getAll()).toEqual(["hi", "world"]);
    // not instant
    expect(dstream.getAll()).toEqual(["hi"]);
    await wait({ until: () => dstream.length == 2 });

    dstream.publish("!");
    expect(dstream.getAll()).toEqual(["hi", "world", "!"]);
    expect(dstream2.getAll()).toEqual(["hi", "world"]);
    await wait({ until: () => dstream2.length == 3 });
    expect(dstream2.getAll()).toEqual(["hi", "world", "!"]);
  });

  const count = 3;
  it(`create ${count} dstreams`, async () => {
    const v: any[] = [];
    for (let i = 0; i < count; i++) {
      const d = await client2.sync.dstream({ name: `foo-${i}` });
      d.push(i);
      await d.save();
      v.push(d);
    }
    for (let i = 0; i < count; i++) {
      v[i].close();
    }
    for (let i = 0; i < count; i++) {
      const d = await client.sync.dstream({ name: `foo-${i}` });
      expect(d.getAll()).toEqual([i]);
      d.close();
    }
  });

  it("test making dkv (key value store)", async () => {
    await client2.sync.dkv({ name: "unrelated" });
  });

  let dkv, dkv2;
  it("test using a dkv (key value store)", async () => {
    dkv2 = await client2.sync.dkv({ name: "cc" });
    dkv = await client.sync.dkv({ name: "cc" });
    expect(dkv.getAll()).toEqual({});
    expect(dkv2.getAll()).toEqual({});
    expect(dkv === dkv2).toBe(false);
    expect(dkv.opts.client.id).not.toEqual(dkv2.opts.client.id);
  });
});

afterAll(after);
