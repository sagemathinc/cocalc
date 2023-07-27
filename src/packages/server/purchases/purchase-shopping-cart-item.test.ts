/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import createAccount from "@cocalc/server/accounts/create-account";
import getLicense from "@cocalc/server/licenses/get-license";
import { uuid } from "@cocalc/util/misc";
import getPool, {
  initEphemeralDatabase,
  getPoolClient,
} from "@cocalc/database/pool";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { getClosingDay, setClosingDay } from "./closing-date";
import getSubscriptions from "./get-subscriptions";
import getBalance from "./get-balance";
import dayjs from "dayjs";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a subscription license and edit it and confirm the subscription cost changes", () => {
  // this is a shopping cart item, which I basically copied from the database...
  const item = {
    account_id: uuid(),
    id: 58,
    added: new Date(),
    product: "site-license",
    description: {
      cpu: 1,
      ram: 2,
      disk: 3,
      type: "quota",
      user: "academic",
      boost: false,
      member: true,
      period: "monthly",
      uptime: "short",
      run_limit: 1,
    },
    cost: {} as any,
  };
  item.cost = computeCost(item.description as any);

  it("make a subscription for a monthly", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id: item.account_id,
    });
    // make closing day near in the future for worse case scenario
    // and to trigger prorated cost.
    let day = new Date().getDate() + 2;
    if (day > 28) {
      day = 1;
    }
    await setClosingDay(item.account_id, day);
    const client = await getPoolClient();
    await purchaseShoppingCartItem(item, client);
    client.release();
  });

  it("checks that that day of the end date of the license (and subscription period) matches that closing date of the account", async () => {
    const day = await getClosingDay(item.account_id);
    const subs = await getSubscriptions({ account_id: item.account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");
    expect(dayjs(subs[0].current_period_end).date()).toBe(day);
    const license_id = subs[0].metadata.license_id;
    const license = await getLicense(license_id);
    const end = dayjs(license.expires);
    expect(end.date()).toBe(day);
    // The cost of the license should be far less than the monthly subscription,
    // because of proration and setting the close day above.
    expect(Math.abs(await getBalance(item.account_id))).toBeLessThan(
      subs[0].cost * 0.25
    );
  });
});
