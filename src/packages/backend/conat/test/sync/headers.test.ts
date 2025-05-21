/*
Test using user-defined headers with kv and stream.

DEVELOPMENT:

pnpm test ./headers.test.ts
*/

import { dstream, dkv } from "@cocalc/backend/conat/sync";
import { once } from "@cocalc/util/async-utils";
import { before, after } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("test headers with a dstream", () => {
  let s;
  const name = `${Math.random()}`;
  it("creates a dstream and writes a value without a header", async () => {
    s = await dstream({ name });
    expect(s.headers(s.length - 1)).toBe(undefined);
    s.publish("x");
    await once(s, "change");
    const h = s.headers(s.length - 1);
    for (const k in h ?? {}) {
      if (!k.startsWith("Nats-") && !k.startsWith("CoCalc-")) {
        throw Error("headers must start with Nats- or CoCalc-");
      }
    }
  });

  it("writes a value with a header", async () => {
    s.publish("y", { headers: { my: "header" } });
    // NOTE: not optimal but this is what is implemented and documented!
    expect(s.headers(s.length - 1)).toEqual(undefined);
    await once(s, "change");
    expect(s.headers(s.length - 1)).toEqual(
      expect.objectContaining({ my: "header" }),
    );
  });

  it("header still there", async () => {
    await s.close();
    s = await dstream({ name });
    expect(s.headers(s.length - 1)).toEqual(
      expect.objectContaining({ my: "header" }),
    );
  });

  it("clean up", async () => {
    await s.purge();
  });
});

describe("test headers with a dkv", () => {
  let s;
  const name = `${Math.random()}`;
  it("creates a dkv and writes a value without a header", async () => {
    s = await dkv({ name });
    s.set("x", 10);
    await once(s, "change");
    const h = s.headers("x");
    for (const k in h ?? {}) {
      if (!k.startsWith("Nats-") && !k.startsWith("CoCalc-")) {
        throw Error("headers must start with Nats- or CoCalc-");
      }
    }
  });

  it("writes a value with a header - defined even before saving", async () => {
    s.set("y", 20, { headers: { my: "header" } });
    expect(s.headers("y")).toEqual(expect.objectContaining({ my: "header" }));
  });

  it("clean up", async () => {
    await s.clear();
  });
});

afterAll(after);
