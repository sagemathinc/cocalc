import maintainSubscriptions from "./maintain-subscriptions";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

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
