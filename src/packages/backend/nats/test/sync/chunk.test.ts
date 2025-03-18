/*
We support arbitrarily large values for both our kv store and stream.

This tests that this actually works.

DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "chunk.test.ts"

WARNING:

If this suddenly breaks, see the comment in packages/nats/sync/general-kv.ts
about potentially having to fork NATS.
*/

import "@cocalc/backend/nats"; // ensure client is setup
import { getMaxPayload } from "@cocalc/nats/util";
import { getConnection } from "@cocalc/nats/client";
import { createDstream } from "./util";
import { dstream } from "@cocalc/backend/nats/sync";
import { dkv as createDkv } from "@cocalc/backend/nats/sync";

describe("create a dstream and a dkv and write a large chunk to each", () => {
  let maxPayload = 0;

  it("sanity check on the max payload", async () => {
    const nc = await getConnection();
    maxPayload = getMaxPayload(nc);
    expect(maxPayload).toBeGreaterThan(1000000);
  });

  it("write a large value with a dstream", async () => {
    const largeValue = "x".repeat(2.5 * maxPayload);
    const stream = await createDstream();
    stream.push(largeValue);
    expect(stream[0].length).toBe(largeValue.length);
    expect(stream[0] == largeValue).toBe(true);
    await stream.save();
    expect(stream.hasUnsavedChanges()).toBe(false);
    const name = stream.name;
    await stream.close();

    const stream2 = await dstream({ name, noAutosave: true });
    expect(stream2[0].length).toBe(largeValue.length);
    expect(stream2[0] == largeValue).toBe(true);
    // @ts-ignore some modicum of cleanup...
    await stream2.stream.purge();
  });

  it("write a large value to a dkv", async () => {
    const name = `test-${Math.random()}`;
    const largeValue = "x".repeat(2.5 * maxPayload);
    const dkv = await createDkv({ name });
    dkv.set("a", largeValue);
    expect(dkv.get("a").length).toBe(largeValue.length);
    await dkv.save();
    expect(dkv.hasUnsavedChanges()).toBe(false);
    await dkv.close();

    const dkv2 = await createDkv({ name, noAutosave: true });
    expect(dkv2.get("a").length).toBe(largeValue.length);
    expect(dkv2.get("a") == largeValue).toBe(true);
    // @ts-ignore some modicum of cleanup...
    await dkv2.delete("a");
  });
});

// TODO: the above is just the most minimal possible test.  a million things
// aren't tested yet...
