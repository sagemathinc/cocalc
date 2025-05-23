/*
DEVELOPMENT:

pnpm test ./time.test.ts
*/

// this sets client
import "@cocalc/backend/nats";

import time, { getSkew } from "@cocalc/nats/time";

describe("get time from nats", () => {
  it("tries to get the time before the skew, so it is not initialized yet", () => {
    expect(time).toThrow("clock skew not known");
  });

  it("gets the skew, so that time is initialized", async () => {
    const skew = await getSkew();
    expect(Math.abs(skew)).toBeLessThan(1000);
  });

  it("gets the time, which should be close to our time on a test system", () => {
    // times in ms, so divide by 1000 so expecting to be within a second
    expect(time() / 1000).toBeCloseTo(Date.now() / 1000, 0);
  });

  it("time is a number", () => {
    expect(typeof time()).toBe("number");
  });
});

import { timeClient, createTimeService } from "@cocalc/nats/service/time";

describe("start the time server and client and test that it works", () => {
  it("starts the time server and queries it", async () => {
    await import("@cocalc/backend/nats");
    createTimeService();
    const client = timeClient();
    const t = await client.time();
    expect(Math.abs(Date.now() - t)).toBeLessThan(200);
  });
});
