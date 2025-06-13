/*
Testing basic ops with dkv

DEVELOPMENT:

pnpm test ./inventory.test.ts

*/

import { before, after, client } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("test the (partial) inventory method on dkv", () => {
  let dkv, dstream;
  const name = `inventory-dkv`;

  it("creates a kv and grabs the partial inventory", async () => {
    dkv = await client.sync.dkv({ name });
    const i = await dkv.kv.inventory();
    expect(i).toEqual({
      bytes: 0,
      count: 0,
      limits: {
        allow_msg_ttl: true,
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
      max_age: 100000,
      max_bytes: 100,
      max_msg_size: 100,
    });
  });
});

describe("test the (partial) inventory method on a dstream", () => {
  let dstream;
  const name = `inventory-dstream`;

  it("creates a dstream and grabs the partial inventory", async () => {
    dstream = await client.sync.dstream({ name });
    const i = await dstream.stream.inventory();
    expect(i).toEqual({
      bytes: 0,
      count: 0,
      limits: {},
      seq: 0,
    });
  });

  it("publish see that updated in the inventory data", async () => {
    dstream.publish(5);
    await dstream.save();
    const i = await dstream.stream.inventory();
    expect(i).toEqual({
      bytes: 1,
      count: 1,
      limits: {},
      seq: 1,
    });
  });

  it("publish some more", async () => {
    dstream.push(1, 2, 3, 4);
    await dstream.save();
    const i = await dstream.stream.inventory();
    expect(i).toEqual({
      bytes: 5,
      count: 5,
      limits: {},
      seq: 5,
    });
  });

  it("change some limits", async () => {
    await dstream.config({
      max_age: 100000,
      max_bytes: 100,
      max_msg_size: 100,
    });
    const { limits } = await dstream.stream.inventory();
    expect(limits).toEqual({
      max_age: 100000,
      max_bytes: 100,
      max_msg_size: 100,
    });
  });
});

afterAll(after);
