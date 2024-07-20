/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, {
  getPoolClient,
  initEphemeralDatabase,
} from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import { createTestAccount, createTestSubscription } from "./test-data";
import { getSubscription } from "./renew-subscription";
import getLicense from "@cocalc/server/licenses/get-license";
import { test } from "./shift-subscriptions";
import { setClosingDay } from "./closing-date";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test shiftSubscriptionToEndOnDay -- involves actual subscriptions", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let license_id = "";

  it("creates an account with closing day equal to 3, and a license and a subscription", async () => {
    await createTestAccount(account_id);
    await setClosingDay(account_id, 3);

    ({ subscription_id, license_id } = await createTestSubscription(
      account_id
    ));
  });

  //   it("confirms that the newly created subscription has a current period end day of 3", async () => {
  //     const sub = await getSubscription(subscription_id);
  //     expect(sub.current_period_end.getDate()).toBe(3);
  //   });

  it("shifts the subscription to have closing date of 6, then confirms (1) subscription shifted, (2) license was changed", async () => {
    const sub = await getSubscription(subscription_id);
    const client = await getPoolClient();
    await test.shiftSubscriptionToEndOnDay(account_id, sub, 6, client);
    client.release();
    // (1) subscription changed
    const sub2 = await getSubscription(subscription_id);
    expect(sub2.current_period_end.getDate()).toBe(6);
    // (2) license changed so end date is 6
    const license = await getLicense(license_id);
    expect(new Date(license.expires ?? 0).getDate()).toBe(6);
  });
});
