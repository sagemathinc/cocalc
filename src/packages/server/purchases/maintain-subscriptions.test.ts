import maintainSubscriptions from "./maintain-subscriptions";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test maintainSubscriptions", () => {
  it("run maintainSubscriptions once and it doesn't crash", async () => {
    try {
      await maintainSubscriptions();
    } catch (_) {
      // rare case that some muck left in database due to half-failed tests, so clean up
      // once and try again.  A little iffy do to tests running in parallel, but should
      // never happen if there is a clean slate.
      await initEphemeralDatabase({ reset: true });
      await maintainSubscriptions();
    }
  });
});
