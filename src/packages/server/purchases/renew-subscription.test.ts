/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// test renew-subscriptions

import { test } from "./renew-subscription";
import { uuid } from "@cocalc/util/misc";
import renewSubscription, { getSubscription } from "./renew-subscription";
import {
  createTestAccount,
  createTestMembershipSubscription,
  createTestSubscription,
} from "./test-data";
import dayjs from "dayjs";
import createCredit from "./create-credit";
import getBalance from "./get-balance";
import getPool from "@cocalc/database/pool";
import { before, after } from "@cocalc/server/test";
import { toDecimal } from "@cocalc/util/money";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("create a subscription, then renew it", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let cost = -1;
  it("creates an account, license and subscription", async () => {
    await createTestAccount(account_id);
    ({ subscription_id, cost } = await createTestSubscription(account_id));
  });

  it("runs renewSubscription which fails due to spending limit", async () => {
    expect.assertions(1);
    try {
      await renewSubscription({ account_id, subscription_id });
    } catch (e) {
      expect(e.message).toMatch("Please pay");
    }
    //const sub = await getSubscription(subscription_id);
  });

  it("add money and then renewSubscription, which works and charges the right amount", async () => {
    await createCredit({ account_id, amount: cost });
    await renewSubscription({ account_id, subscription_id });
    const sub = await getSubscription(subscription_id);
    expect(
      dayjs(sub.current_period_end).diff(dayjs(), "day"),
    ).toBeGreaterThanOrEqual(50); // another month added...
    expect(toDecimal(await getBalance({ account_id })).toNumber()).toBeCloseTo(
      0,
    );
  });

  it("renews the subscription again but with force set to true, so that the subscription renews (even though we are out of money)", async () => {
    await renewSubscription({ account_id, subscription_id, force: true });
    expect(toDecimal(await getBalance({ account_id })).toNumber()).toBeCloseTo(
      -cost,
    );
    const sub = await getSubscription(subscription_id);
    expect(
      dayjs(sub.current_period_end).diff(dayjs(), "day"),
    ).toBeGreaterThanOrEqual(80); // about 2 months added...
  });
});

describe("adding and subtracting month and year to a date", () => {
  it("adds a month to Feb 2 and gets March 2", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "month")
        .toISOString(),
    ).toBe("2023-03-02T00:00:00.000Z");
  });

  it("adds a year to Feb 2 and gets Feb 2 a year later", () => {
    expect(
      test
        .addInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString(),
    ).toBe("2024-02-02T00:00:00.000Z");
  });

  it("subtracts a month from March 2 and gets Feb 2", () => {
    expect(
      test
        .subtractInterval(new Date("2023-03-02T00:00:00.000Z"), "month")
        .toISOString(),
    ).toBe("2023-02-02T00:00:00.000Z");
  });
  it("subtracts a year to Feb 2 and gets Feb 2 a year earlier", () => {
    expect(
      test
        .subtractInterval(new Date("2023-02-02T00:00:00.000Z"), "year")
        .toISOString(),
    ).toBe("2022-02-02T00:00:00.000Z");
  });
});

describe("membership subscription renewal", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let original_end: Date | undefined;
  let membershipClass = "member";
  let interval: "month" | "year" = "month";
  it("creates an account and membership subscription", async () => {
    await createTestAccount(account_id);
    const created = await createTestMembershipSubscription(account_id, {
      class: "member",
    });
    subscription_id = created.subscription_id;
    original_end = created.end;
    membershipClass = created.membershipClass;
    interval = created.interval;
  });

  it("renews membership subscription and records a membership purchase", async () => {
    const purchase_id = await renewSubscription({
      account_id,
      subscription_id,
    });
    const sub = await getSubscription(subscription_id);
    const expectedEnd =
      interval == "month"
        ? dayjs(original_end).add(1, "month").toDate()
        : dayjs(original_end).add(1, "year").toDate();
    expect(
      Math.abs(sub.current_period_end.valueOf() - expectedEnd.valueOf()),
    ).toBeLessThan(1000 * 60 * 10);
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT service, description FROM purchases WHERE id=$1",
      [purchase_id],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].service).toBe("membership");
    expect(rows[0].description?.type).toBe("membership");
    expect(rows[0].description?.class).toBe(membershipClass);
  });
});
