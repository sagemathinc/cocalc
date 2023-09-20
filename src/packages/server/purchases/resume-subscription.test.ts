/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test resuming a canceled subscription

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import { createTestAccount, createTestSubscription } from "./test-data";
import dayjs from "dayjs";
import resumeSubscription from "./resume-subscription";
import cancelSubscription from "./cancel-subscription";
import { getSubscription } from "./renew-subscription";
import getLicense from "@cocalc/server/licenses/get-license";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a subscription, cancel it, then resume it", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let license_id = "";
  it("creates an account, license and subscription", async () => {
    await createTestAccount(account_id);
    ({ subscription_id, license_id } = await createTestSubscription(
      account_id
    ));
  });

  it("tries to resume the subscription we just made which isn't canceled and get error, since only canceled subscriptions can be resumed", async () => {
    expect.assertions(1);
    try {
      await resumeSubscription({ account_id, subscription_id });
    } catch (e) {
      expect(e.message).toMatch("canceled subscription");
    }
  });

  it("cancels our subscription, so that we can renew it.  This works, since we have money from the cancelation.", async () => {
    await cancelSubscription({
      account_id,
      subscription_id,
      now: true,
    });
    expect((await getSubscription(subscription_id)).status).toBe("canceled");
    const license = await getLicense(license_id);
    // fully refunded (since starts in future) -- license is not active for nonzero period
    expect(license.expires).toBe(license.activates);

    // now resume:
    await resumeSubscription({ account_id, subscription_id });
    // and it is active
    expect((await getSubscription(subscription_id)).status).toBe("active");

    // confirm the license is active again for same period as subscription current period.
    const license2 = await getLicense(license_id);
    const sub = await getSubscription(subscription_id);
    expect(dayjs(license.activates).diff(license2.activates)).toBe(0);
    expect(dayjs(license2.expires).diff(sub.current_period_end)).toBe(0);
  });

  it("cancels again but rest our money, so renew fails due to lack of money.", async () => {
    await cancelSubscription({
      account_id,
      subscription_id,
      now: true,
    });
    const pool = getPool();
    await pool.query("DELETE FROM purchases WHERE account_id=$1", [
      account_id,
    ]);
    expect.assertions(1);
    try {
      await resumeSubscription({ account_id, subscription_id });
    } catch (e) {
      expect(e.message).toMatch("do not have enough credits");
    }
  });
});
