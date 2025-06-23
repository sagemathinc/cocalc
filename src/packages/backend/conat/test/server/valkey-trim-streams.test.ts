/*
Test automatically trimming the valkey streams used to coordinate subscription
interest and sticky subject choices.

pnpm test ./valkey-trim-streams.test.ts
*/

import {
  before,
  after,
  initConatServer,
  runValkey,
} from "@cocalc/backend/conat/test/setup";
import { waitForSubscription } from "./util";

beforeAll(before);

// this is very important, since the sticky resolution needs to be consistent
describe("create two servers connected via valkey and observe stream trimming", () => {
  let server1, server2, client1, client2, valkeyServer;
  // we configure very aggressive trimming -- every 500ms we delete everything older than 1 seconds.
  const opts = { valkeyTrimMaxAge: 1000, valkeyTrimInterval: 500 };
  it("create servers and clients", async () => {
    valkeyServer = await runValkey();
    const valkey = valkeyServer.address;
    server1 = await initConatServer({
      valkey,
      ...opts,
    });
    server2 = await initConatServer({
      valkey,
      ...opts,
    });
    client1 = server1.client();
    client2 = server2.client();
  });

  it("test that the stream is working at all", async () => {
    const subject = "stream.trim";
    const sub = await client1.subscribe(subject);
    await waitForSubscription(server1, subject);
    await waitForSubscription(server2, subject);
    client2.publish(subject, "foo");
    await sub.next();
  });
});

afterAll(after);
