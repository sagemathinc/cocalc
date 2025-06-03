/*
Test using binary data with kv and stream.

You can just store binary directly in kv and stream, since MsgPack
handles buffers just fine. 

DEVELOPMENT:

pnpm test ./binary.test.ts
*/

import { dstream, dkv } from "@cocalc/backend/conat/sync";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

let maxPayload;

describe("test binary data with a dstream", () => {
  let s,
    name = `${Math.random()}`;

  // binary values come back as Uint8Array with streams
  const data10 = Uint8Array.from(Buffer.from("x".repeat(10)));
  it("creates a binary dstream and writes/then reads binary data to/from it", async () => {
    s = await dstream<Buffer>({ name });
    expect(s.name).toBe(name);
    s.publish(data10);
    expect(s.get(0).length).toEqual(data10.length);
    await s.save();
    s.close();
    s = await dstream({ name });
    expect(s.get(0).length).toEqual(data10.length);
  });

  it("sanity check on the max payload", async () => {
    const client = connect();
    await wait({ until: () => client.info != null });
    maxPayload = client.info?.max_payload ?? 0;
    expect(maxPayload).toBeGreaterThan(500000);
  });

  it("writes large binary data to the dstream to test chunking", async () => {
    s = await dstream({ name });
    const data = Uint8Array.from(Buffer.from("x".repeat(maxPayload * 1.5)));
    s.publish(data);
    expect(s.get(s.length - 1).length).toEqual(data.length);
    await s.save();
    s.close();
    s = await dstream({ name });
    expect(s.get(s.length - 1).length).toEqual(data.length);
  });

  it("clean up", async () => {
    await s.delete({ all: true });
    await s.close();
  });
});

describe("test binary data with a dkv", () => {
  let s,
    name = `${Math.random()}`;

  // binary values come back as buffer with dkv
  const data10 = Buffer.from("x".repeat(10));

  it("creates a binary dkv and writes/then reads binary data to/from it", async () => {
    s = await dkv({ name });
    expect(s.name).toBe(name);
    s.x = data10;
    expect(s.x).toEqual(data10);
    expect(s.x.length).toEqual(data10.length);
    await s.save();
    s.close();
    s = await dkv({ name });
    await wait({ until: () => s.has("x") });
    expect(s.x.length).toEqual(data10.length);
    expect(s.x).toEqual(data10);
  });

  it("writes large binary data to the dkv to test chunking", async () => {
    s = await dkv({ name });
    const data = Uint8Array.from(Buffer.from("x".repeat(maxPayload * 1.5)));
    s.y = data;
    expect(s.y.length).toEqual(data.length);
    await s.save();
    s.close();
    s = await dkv({ name });
    expect(s.y.length).toEqual(data.length);
  });

  it("clean up", async () => {
    await s.clear();
    s.close();
  });
});

afterAll(after);
