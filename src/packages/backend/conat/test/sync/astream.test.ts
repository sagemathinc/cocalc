/*
Testing basic ops with astream

DEVELOPMENT:

pnpm test ./astream.test.ts

*/

import { dstream, astream } from "@cocalc/backend/conat/sync";
import { wait } from "@cocalc/backend/conat/test/util";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("test basics with an astream", () => {
  let client, s, s2;
  const name = "test-astream";

  it("creates the astream, then publish and read a value", async () => {
    client = connect();
    s = astream({ name, client });
    // s2 = astream({ name, client, noCache: true });
    const { seq } = await s.publish("x");
    expect(seq).toBe(1);
    expect(await s.get(1)).toBe("x");
    //expect(await s2.get(1)).toBe("x");
  });

  it("publish a message with a header", async () => {
    const { seq, time } = await s.publish("has a header", {
      headers: { foo: "bar" },
    });
    expect(await s.get(seq)).toBe("has a header");
    expect(await s.headers(seq)).toEqual(
      expect.objectContaining({ foo: "bar" }),
    );
    // note that seq and time are also in the header
    expect(await s.headers(seq)).toEqual({ foo: "bar", seq, time });
  });

  it("cleans up", () => {
    s.close();
  });
});

afterAll(after);
