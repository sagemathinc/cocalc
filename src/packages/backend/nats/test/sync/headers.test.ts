/*
Test using user-defined headers with kv and stream.

DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "headers.test.ts"
*/

import "@cocalc/backend/nats"; // ensure client is setup
import { getMaxPayload } from "@cocalc/nats/util";
import { stream, kv } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";
import { getConnection } from "@cocalc/nats/client";

describe("test headers with a stream", () => {
  let s;
  it("creates a stream and writes a value without a header", async () => {
    s = await stream({ name: `${Math.random()}` });
    expect(s.headers(s.length - 1)).toBe(undefined);
    s.publish("x");
    await once(s, "change");
    expect(s.headers(s.length - 1)).toBe(undefined);
  });

  it("writes a value with a header", async () => {
    s.publish("y", { headers: { my: "header" } });
    await once(s, "change");
    expect(s.headers(s.length - 1)).toEqual({ my: "header" });
  });

  it("writes a large value that requires chunking and a header", async () => {
    s.publish("y".repeat(getMaxPayload(await getConnection()) * 2), {
      headers: { large: "chunks", multiple: "keys" },
    });
    await once(s, "change");
    expect(s.headers(s.length - 1)).toEqual(
      expect.objectContaining({ large: "chunks", multiple: "keys" }),
    );
    expect(s.headers(s.length - 1)).toEqual({
      large: "chunks",
      multiple: "keys",
      // CoCalc- and Nats- headers get used internally, but are still visible.
      // 3 because of how size was chosen above.
      "CoCalc-Chunks": "3/3",
    });
  });

  it("clean up", async () => {
    await s.purge();
  });
});

describe("test headers with low level general kv", () => {
  let s, gkv;
  it("creates a kv and writes a value without a header", async () => {
    s = await kv({ name: `${Math.random()}` });
    gkv = s.generalKV;
    const key = `${s.prefix}.x`;
    expect(gkv.headers(key)).toBe(undefined);
    gkv.set(key, 10);
    await once(gkv, "change");
    expect(gkv.headers(key)).toBe(undefined);
  });

  it("writes a value with a header", async () => {
    const key = `${s.prefix}.y`;
    gkv.set(key, 20, { headers: { my: "header" } });
    await once(gkv, "change");
    expect(gkv.headers(key)).toEqual({ my: "header" });
  });

  it("changes header without changing value", async () => {
    const key = `${s.prefix}.y`;
    gkv.set(key, 20, { headers: { my: "header2", second: "header" } });
    await once(gkv, "change");
    expect(gkv.headers(key)).toEqual(
      expect.objectContaining({ my: "header2", second: "header" }),
    );
  });

  it("removes header without changing value", async () => {
    const key = `${s.prefix}.y`;
    gkv.set(key, 20, { headers: { my: null, second: "header" } });
    await once(gkv, "change");
    expect(gkv.headers(key)).toEqual(
      expect.objectContaining({ second: "header" }),
    );
  });

  it("writes a large value that requires chunking and a header", async () => {
    const key = `${s.prefix}.big`;
    gkv.set(key, "x".repeat(getMaxPayload(await getConnection()) * 2), {
      headers: { the: "header" },
    });
    await once(gkv, "change");
    expect(gkv.headers(key)).toEqual(
      expect.objectContaining({ the: "header" }),
    );
  });

  it("clean up", async () => {
    await s.clear();
  });
});
