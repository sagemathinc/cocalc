/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import cancelSubscription from "./cancel-subscription";
import resumeSubscription from "./resume-subscription";

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
      run_limit: 3,
    },
    cost: {} as any,
  };
  item.cost = computeCost(item.description as any);

  it("make a monthly subscription for a license", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id: item.account_id,
    });

    // set min balance so this all works below
    const pool = getPool();
    await pool.query("UPDATE accounts SET min_balance=$1 WHERE account_id=$2", [
      -1000,
      item.account_id,
    ]);
    // make closing day near in the future for worse case scenario
    // and to trigger prorated cost.
    let day = new Date().getDate() + 2;
    if (day > 28) {
      day = 1;
    }
    await setClosingDay(item.account_id, day);
    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
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
    expect(
      Math.abs(await getBalance({ account_id: item.account_id })),
    ).toBeLessThan(subs[0].cost * 0.25);
  });

  it("cancels subscription and verifies that balance is small", async () => {
    const subs = await getSubscriptions({ account_id: item.account_id });
    const { id: subscription_id } = subs[0];
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
      cancelImmediately: true,
    });
    expect(await getBalance({ account_id: item.account_id })).toBeCloseTo(0, 1);
  });

  it("resumes subscription, then cancels it again, and verifies again that the balance is small", async () => {
    const subs = await getSubscriptions({ account_id: item.account_id });
    const { id: subscription_id } = subs[0];
    await resumeSubscription({
      account_id: item.account_id,
      subscription_id,
    });
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
      cancelImmediately: true,
    });
    expect(await getBalance({ account_id: item.account_id })).toBeCloseTo(0, 1);
  });

  it("same test but with different parameters for the subscription, e.g., business and yearly", async () => {
    const item = {
      account_id: uuid(),
      id: 389,
      added: new Date(),
      product: "site-license",
      description: {
        cpu: 2,
        ram: 3,
        disk: 5,
        type: "quota",
        user: "business",
        boost: false,
        member: true,
        period: "yearly",
        uptime: "short",
        run_limit: 200,
      },
      cost: {} as any,
    };
    item.cost = computeCost(item.description as any);
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id: item.account_id,
    });

    // set min balance so this all works below
    const pool = getPool();
    await pool.query("UPDATE accounts SET min_balance=$1 WHERE account_id=$2", [
      -100000,
      item.account_id,
    ]);
    // make closing day near in the future
    let day = new Date().getDate() + 6;
    if (day > 28) {
      day = 1;
    }
    await setClosingDay(item.account_id, day);

    // balance starts at 0
    expect(await getBalance({ account_id: item.account_id })).toBeCloseTo(0, 1);

    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
    client.release();

    const subs = await getSubscriptions({ account_id: item.account_id });
    const { id: subscription_id } = subs[0];
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
      cancelImmediately: true,
    });
    expect(await getBalance({ account_id: item.account_id })).toBeCloseTo(0, 1);
    await resumeSubscription({
      account_id: item.account_id,
      subscription_id,
    });
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
      cancelImmediately: true,
    });
    expect(await getBalance({ account_id: item.account_id })).toBeCloseTo(0, 1);
  });
});
