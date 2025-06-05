/*
Testing basic ops with dkv

DEVELOPMENT:

pnpm test ./akv.test.ts

*/

import { dkv as createDkv, akv as createAkv } from "@cocalc/backend/conat/sync";
import { wait } from "@cocalc/backend/conat/test/util";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("test basics with an akv", () => {
  let kv, client;
  const name = `test-${Math.random()}`;

  it("creates the akv, then set and read a value", async () => {
    client = connect();
    kv = createAkv({ name, client });
    await kv.set("x", 10);
    expect(await kv.get("x")).toBe(10);
  });

  it("reads a value that isn't there and gets undefined", async () => {
    expect(await kv.get("y")).toBe(undefined);
  });

  it("writes and reads null and gets null", async () => {
    await kv.set("y", null);
    expect(await kv.get("y")).toBe(null);
  });

  it("gets all keys", async () => {
    expect(await kv.keys()).toEqual(["x", "y"]);
  });

  it("check that deleting a value works", async () => {
    await kv.delete("x");
    expect(await kv.get("x")).toBe(undefined);
  });

  it("cleans up", async () => {
    const k = await createDkv({ name, client });
    k.clear();
    await k.close();
  });
});

describe("test interop with a dkv", () => {
  let akv, dkv, client;
  const name = `test-${Math.random()}`;

  it("creates the akv and dkv", async () => {
    client = connect();
    akv = createAkv({ name, client });
    dkv = await createDkv({ name, client });
  });

  it("sets value in the dkv and reads it using the akv", async () => {
    dkv.set("x", 25);
    await dkv.save();
    expect(await akv.get("x")).toBe(25);
  });

  it("sets value in the akv and reads it using the dkv", async () => {
    await akv.set("z", 389);
    await wait({ until: () => dkv.has("z") });
    expect(await dkv.get("z")).toBe(389);
  });

  it("check headers work", async () => {
    dkv.set("h", 10, { headers: { foo: "bar" } });
    await dkv.save();
    expect(await akv.headers("h")).toEqual(
      expect.objectContaining({ foo: "bar" }),
    );

    await akv.set("h2", 20, { headers: { foo: "baz" } });
    expect(await akv.headers("h2")).toEqual(
      expect.objectContaining({ foo: "baz" }),
    );
    await wait({ until: () => dkv.has("h2") });
    expect(await dkv.headers("h2")).toEqual(
      expect.objectContaining({ foo: "baz" }),
    );
  });

  it("check sqlite query fails", async () => {
    await expect(async () => {
      await akv.sqlite("SELECT count(*) AS n FROM messages");
    }).rejects.toThrowError("sqlite command not currently supported");
  });

  //   it("check sqlite query works", async () => {
  //     const v = await akv.sqlite("SELECT count(*) AS n FROM messages");
  //     expect(v[0].n).toBe((await akv.keys()).length);
  //   });

  it("cleans up", async () => {
    dkv.clear();
    await dkv.close();
  });
});

describe("testing writing and reading chunked data", () => {
  let maxPayload = 0;
  let client;

  it("sanity check on the max payload", async () => {
    client = connect();
    await wait({ until: () => client.info != null });
    maxPayload = client.info?.max_payload ?? 0;
    expect(maxPayload).toBeGreaterThan(500000);
  });

  let kv;
  const name = `test-${Math.random()}`;
  it("creates akv, then set and read a large value", async () => {
    kv = createAkv({ name, client });
    const val = "z".repeat(maxPayload * 1.5) + "cocalc";
    await kv.set("x", val);
    expect(await kv.get("x")).toBe(val);
  });

  it("cleans up", async () => {
    const k = await createDkv({ name, client });
    k.clear();
    await k.close();
  });
});

afterAll(after);
