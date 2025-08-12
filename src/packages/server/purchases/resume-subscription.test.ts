/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// test resuming a canceled subscription

import { uuid } from "@cocalc/util/misc";
import { createTestAccount, createTestSubscription } from "./test-data";
//import dayjs from "dayjs";
import resumeSubscription from "./resume-subscription";
import cancelSubscription from "./cancel-subscription";
import { getSubscription } from "./renew-subscription";
import getLicense from "@cocalc/server/licenses/get-license";
import getBalance from "./get-balance";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("create a subscription, cancel it, then resume it", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let license_id = "";
  it("creates an account, license and subscription", async () => {
    await createTestAccount(account_id);
    ({ subscription_id, license_id } =
      await createTestSubscription(account_id));
  });

  it("confirms the current_period_end of the subscriptions matches expires of the license", async () => {
    const license = await getLicense(license_id);
    const sub = await getSubscription(subscription_id);
    expect(license.expires).toBe(sub.current_period_end.valueOf());
  });

  it("tries to resume the subscription we just made which isn't canceled and get error, since only canceled subscriptions can be resumed", async () => {
    expect.assertions(1);
    try {
      await resumeSubscription({ account_id, subscription_id });
    } catch (e) {
      expect(e.message).toMatch("canceled subscription");
    }
  });

  it("cancels our subscription, then start it again.", async () => {
    const balanceBeforeCancel = await getBalance({ account_id });
    await cancelSubscription({
      account_id,
      subscription_id,
    });
    expect((await getSubscription(subscription_id)).status).toBe("canceled");
    // balance should not change.
    expect(await getBalance({ account_id })).toBeCloseTo(balanceBeforeCancel);
    const license = await getLicense(license_id);
    // now resume:
    await resumeSubscription({ account_id, subscription_id });
    // and it is active
    expect((await getSubscription(subscription_id)).status).toBe("active");

    // confirm the license is active again for same period as subscription current period.
    const license2 = await getLicense(license_id);
    const sub = await getSubscription(subscription_id);
    expect(license.activates).toBe(license2.activates);
    expect(license.expires).toBe(license2.expires);
    expect(license2.expires).toBe(sub.current_period_end.valueOf());
  });
});
