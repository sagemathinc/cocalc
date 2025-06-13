/*
Testing basic ops with dkv

DEVELOPMENT:

pnpm test ./inventory.test.ts

*/

import { before, after, client } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("test the (partial) inventory method on core stream", () => {
  let dkv, dstream;
  const name = `inventory-1`;

  it("creates a kv and grabs the partial inventory", async () => {
    dkv = await client.sync.dkv({ name });
    const i = await dkv.kv.inventory();
    expect(i).toEqual({
      bytes: 0,
      count: 0,
      limits: {
        allow_msg_ttl: true,
        discard_policy: "old",
        max_age: 0,
        max_bytes: -1,
        max_bytes_per_second: -1,
        max_msg_size: -1,
        max_msgs: -1,
        max_msgs_per_second: -1,
      },
      seq: 0,
    });
  });

  it("set an element and see that updated in the inventory data", async () => {
    dkv.a = 5;
    const i = await dkv.kv.inventory();
    expect(i).toEqual({
      bytes: 2,
      count: 1,
      limits: {
        allow_msg_ttl: true,
        discard_policy: "old",
        max_age: 0,
        max_bytes: -1,
        max_bytes_per_second: -1,
        max_msg_size: -1,
        max_msgs: -1,
        max_msgs_per_second: -1,
      },
      seq: 1,
    });
  });

  it("delete an element and see that count does NOT change, because of the tombstone; bytes are larger though since it has to contain the tombstone (in a header)", async () => {
    delete dkv.a;
    const { bytes, count, seq } = await dkv.kv.inventory();
    expect({ bytes, count, seq }).toEqual({
      bytes: 23,
      count: 1,
      seq: 2,
    });
  });

  it("change some limits", async () => {
    await dkv.config({ max_age: 100000, max_bytes: 100, max_msg_size: 100 });
    const { limits } = await dkv.kv.inventory();
    expect(limits).toEqual({
      allow_msg_ttl: true,
      discard_policy: "old",
      max_age: 100000,
      max_bytes: 100,
      max_bytes_per_second: -1,
      max_msg_size: 100,
      max_msgs: -1,
      max_msgs_per_second: -1,
    });
  });
  
  it("cleans up", async () => {
    client.close();
  });
});

afterAll(after);
