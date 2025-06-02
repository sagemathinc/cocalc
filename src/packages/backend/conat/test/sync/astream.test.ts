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
  let client, s;
  const name = "test-astream";

  it("creates the astream, then publish and read a value", async () => {
    client = connect();
    s = astream({ name, client });
    const { seq } = await s.publish("x");
    expect(seq).toBe(1);
    expect(await s.get(1)).toBe("x");
  });

  it("cleans up", () => {
    s.close();
  });
});

afterAll(after);
