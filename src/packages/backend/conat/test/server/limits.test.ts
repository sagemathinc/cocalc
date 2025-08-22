/*
Test various configurable limits of the server.

pnpm test ./limits.test.ts
*/

import { createServer } from "@cocalc/backend/conat/test/setup";

describe("test the per user subscription limit", () => {
  let server;

  it("creates a server with a subscription limit of 3", async () => {
    server = await createServer({
      maxSubscriptionsPerClient: 3,
      clusterName: undefined, // since can't bootstrap with so few subscriptions!
    });
  });

  let client;
  it("creates a client and makes 2 subscriptions fine", async () => {
    // can't make a third, since the default INBOX subscription already counts.
    client = server.client();
    await client.sub("sub1");
    await client.sub("sub2");
  });

  it("creates another subscription and gets an error", async () => {
    await expect(async () => {
      await client.sub("sub3");
    }).rejects.toThrow("limit");
  });

  it("cleans up", () => {
    client.close();
    server.close();
  });
});
