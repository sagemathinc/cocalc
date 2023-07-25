/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test some functions in renew-subscriptions

import { test } from "./renew-subscription";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import createSubscription from "./create-subscription";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import renewSubscription, { getSubscription } from "./renew-subscription";
import { license0 } from "./test-data";
import dayjs from "dayjs";
import createCredit from "./create-credit";
import getBalance, { getPendingBalance } from "./get-balance";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a subscription, then renew it", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let license_id = "";
  const cost = 10;
  it("creates an account, license and subscription", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const info = getPurchaseInfo(license0);
    license_id = await createLicense(account_id, info);
    subscription_id = await createSubscription(
      {
        account_id,
        cost,
        interval: "month",
        current_period_start: dayjs().toDate(),
        current_period_end: dayjs().add(1, "month").toDate(),
        status: "active",
        metadata: { type: "license", license_id },
        latest_purchase_id: 0,
      },
      null
    );
  });

  it("runs renewSubscription which fails due to spending limit", async () => {
    expect.assertions(1);
    try {
      await renewSubscription({ account_id, subscription_id });
    } catch (e) {
      expect(e.message).toMatch("do not have enough credits");
    }
    //const sub = await getSubscription(subscription_id);
  });

  it("add money and then renewSubscription, which works and charges the right amount", async () => {
    await createCredit({ account_id, amount: cost });
    await renewSubscription({ account_id, subscription_id });
    const sub = await getSubscription(subscription_id);
    expect(
      dayjs(sub.current_period_end).diff(dayjs(), "day")
    ).toBeGreaterThanOrEqual(50); // another month added...
    expect(await getBalance(account_id)).toBeCloseTo(0);
  });

  it("renews the subscription again but with force set to true, so that the subscription renews (even though we are out of money), but via a *pending* purchase", async () => {
    await renewSubscription({ account_id, subscription_id, force: true });
    // purchase is pending
    expect(await getBalance(account_id)).toBeCloseTo(0);
    expect(await getPendingBalance(account_id)).toBeCloseTo(-cost);
    const sub = await getSubscription(subscription_id);
    expect(
      dayjs(sub.current_period_end).diff(dayjs(), "day")
    ).toBeGreaterThanOrEqual(80); // about 2 months added...
  });
});

describe("adding and subtracting month and year to a date", () => {
  it("adds a month to Feb 2 and gets March 2", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "month")
        .toISOString()
    ).toBe("2023-03-02T00:00:00.000Z");
  });

  it("adds a year to Feb 2 and gets Feb 2 a year later", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString()
    ).toBe("2024-02-02T00:00:00.000Z");
  });

  it("subtracts a month from March 2 and gets Feb 2", () => {
    expect(
      test
        .subtractInterval(new Date("2023-03-02T00:00:00.000Z"), "month")
        .toISOString()
    ).toBe("2023-02-02T00:00:00.000Z");
  });
  it("subtracts a year to Feb 2 and gets Feb 2 a year earlier", () => {
    expect(
      test
        .subtractInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString()
    ).toBe("2022-02-02T00:00:00.000Z");
  });
});
