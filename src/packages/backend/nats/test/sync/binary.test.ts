/*
Test using binary data with kv and stream.

The default value type is json, which is heavily tested in all the other
unit tests.  Here we test binary data instead.

DEVELOPMENT:

pnpm exec jest --forceExit "binary.test.ts"
*/

import "@cocalc/backend/nats"; // ensure client is setup
import { getMaxPayload } from "@cocalc/nats/util";
import { getConnection } from "@cocalc/nats/client";
import { dstream, dkv } from "@cocalc/backend/nats/sync";

describe("test binary data with a dstream", () => {
  let s,
    s2,
    name = `${Math.random()}`;

  // binary values come back as Uint8Array with streams
  const data10 = Uint8Array.from(Buffer.from("x".repeat(10)));
  it("creates a binary dstream and writes/then reads binary data to/from it", async () => {
    s = await dstream({ name, valueType: "binary" });
    expect(s.name).toBe(name);
    s.publish(data10);
    expect(s.get(0).length).toEqual(data10.length);
    await s.close();
    s = await dstream({ name, valueType: "binary" });
    expect(s.get(0).length).toEqual(data10.length);
  });

  it("creates a dstream with the same name but json format and sees it is separate", async () => {
    s2 = await dstream({ name, valueType: "json" });
    expect(s2.length).toBe(0);
    s = await dstream({ name, valueType: "binary" });
    expect(s.length).toBe(1);
    s2.push({ hello: "cocalc" });
    expect(s.length).toBe(1);
    expect(s2.length).toBe(1);
    await s2.close();
    s2 = await dstream({ name, valueType: "json" });
    expect(s2.get(0)).toEqual({ hello: "cocalc" });
  });

  it("writes large binary data to the dstream to test chunking", async () => {
    s = await dstream({ name, valueType: "binary" });
    const nc = await getConnection();
    const maxPayload = getMaxPayload(nc);
    const data = Uint8Array.from(Buffer.from("x".repeat(maxPayload * 1.5)));
    s.publish(data);
    expect(s.get(s.length - 1).length).toEqual(data.length);
    await s.close();
    s = await dstream({ name, valueType: "binary" });
    expect(s.get(s.length - 1).length).toEqual(data.length);
  });

  it("clean up", async () => {
    await s.purge();
    await s.close();
    await s2.purge();
    await s2.close();
  });
});

describe("test binary data with a dkv", () => {
  let s,
    name = `${Math.random()}`;

  // binary values come back as buffer with dkv
  const data10 = Buffer.from("x".repeat(10));

  it("creates a binary dkv and writes/then reads binary data to/from it", async () => {
    s = await dkv({ name, valueType: "binary" });
    expect(s.name).toBe(name);
    s.x = data10;
    expect(s.x).toEqual(data10);
    expect(s.x.length).toEqual(data10.length);
    await s.close();
    s = await dkv({ name, valueType: "binary" });
    expect(s.x.length).toEqual(data10.length);
    expect(s.x).toEqual(data10);
  });

  let s2;
  it("creates a dkv with the same name but json format and sees it is separate", async () => {
    s2 = await dkv({ name, valueType: "json" });
    expect(s2.length).toBe(0);
    s = await dkv({ name, valueType: "binary" });
    expect(s.length).toBe(1);
    s2.x = { hello: "cocalc" };
    expect(s.length).toBe(1);
    expect(s2.length).toBe(1);
    await s2.close();
    s2 = await dkv({ name, valueType: "json" });
    expect(s2.x).toEqual({ hello: "cocalc" });
    expect(s.x.length).toEqual(data10.length);
  });

  it("writes large binary data to the dkv to test chunking", async () => {
    s = await dkv({ name, valueType: "binary" });
    const nc = await getConnection();
    const maxPayload = getMaxPayload(nc);
    const data = Uint8Array.from(Buffer.from("x".repeat(maxPayload * 1.5)));
    s.y = data;
    expect(s.y.length).toEqual(data.length);
    await s.close();
    s = await dkv({ name, valueType: "binary" });
    expect(s.y.length).toEqual(data.length);
  });

  it("clean up", async () => {
    await s.clear();
    await s.close();
    await s2.clear();
    await s2.close();
  });
});
