/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test some functions in renew-subscriptions

import renewSubscription, { test } from "./renew-subscription";
import dayjs from "dayjs";
import { getMockPool } from "@cocalc/database/pool";

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

describe("test renewing a license", () => {
  const pool = getMockPool();
  const now = new Date();
  const current_period_start = dayjs(now)
    .subtract(1, "month")
    .add(1, "day")
    .toDate();
  const current_period_end = dayjs(now).add(1, "day").toDate();
  const account_id = "752be8c3-ff74-41d8-ad1c-b2fb92c3e7eb";
  const license_id = "60f12a8d-9e2b-4fd1-ad66-cc35069fa30e";
  const subscription_id = 1;
  const cost = 5;
  const interval = "month";
  const metadata = { type: "license", license_id };
  const origInfo = {
    purchased: {
      end: current_period_end,
      type: "quota",
      user: "business",
      boost: false,
      start: current_period_start,
      upgrade: "custom",
      quantity: 1,
      account_id,
      custom_cpu: 1,
      custom_ram: 2,
      custom_disk: 3,
      subscription: "monthly",
      custom_member: true,
      custom_uptime: "short",
      custom_dedicated_cpu: 0,
      custom_dedicated_ram: 0,
    },
  };
  const modifiedInfo = {
    purchased: {
      end: dayjs(current_period_end).add(1, "month").toDate(),
      type: "quota",
      user: "business",
      boost: false,
      start: current_period_start,
      upgrade: "custom",
      quantity: 1,
      account_id,
      custom_cpu: 1,
      custom_ram: 2,
      custom_disk: 3,
      subscription: "monthly",
      custom_member: true,
      custom_uptime: "short",
      custom_dedicated_cpu: 0,
      custom_dedicated_ram: 0,
    },
  };
  const purchase_id = 1;

  it("renews a subscription", async () => {
    pool.mock(
      "SELECT account_id, metadata, cost, interval, current_period_end FROM subscriptions WHERE id=$1",
      [subscription_id],
      [{ account_id, metadata, cost, interval, current_period_end }]
    );
    pool.mock(
      "SELECT info->'purchased' as info, activates, expires FROM site_licenses WHERE id=$1",
      [license_id],
      [
        {
          info: origInfo.purchased,
          actives: current_period_start,
          expires: current_period_end,
        },
      ]
    );
    pool.mock(
      "SELECT COUNT(*) as count FROM accounts WHERE account_id = $1::UUID",
      [account_id],
      [{ count: 1 }]
    );
    pool.mock(
      "SELECT service, value FROM purchase_quotas WHERE account_id=$1",
      [account_id],
      []
    );
    pool.mock(
      "SELECT min_balance FROM accounts WHERE account_id=$1",
      [account_id],
      [{ min_balance: undefined }]
    );
    pool.mock(
      "SELECT -SUM(COALESCE(cost, cost_per_hour * EXTRACT(EPOCH FROM (COALESCE(period_end, NOW()) - period_start)) / 3600)) as balance FROM purchases WHERE account_id=$1",
      [account_id],
      [{ balance: 100 }] // plenty of money
    );
    pool.mock(
      "UPDATE site_licenses SET quota=$1,run_limit=$2,info=$3,expires=$4,activates=$5 WHERE id=$6",
      [
        {
          user: "business",
          ram: 2,
          cpu: 1,
          dedicated_ram: 0,
          dedicated_cpu: 0,
          disk: 3,
          always_running: false,
          idle_timeout: "short",
          member: true,
          boost: false,
        },
        1,
        modifiedInfo,
        dayjs(current_period_end).add(1, "month").toDate(),
        current_period_start,
        license_id,
      ],
      []
    );
    pool.mock(
      "INSERT INTO purchases (time, account_id, project_id, cost, cost_per_hour, period_start, period_end, service, description,invoice_id, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
      [
        account_id,
        null,
        cost,
        null,
        null,
        null,
        "edit-license",
        {
          type: "edit-license",
          license_id,
          origInfo: origInfo.purchased,
          modifiedInfo: modifiedInfo.purchased,
          note: "This is a subscription with a fixed cost per period. We use the fixed cost $5.00.",
        },
        null,
        null,
        null,
      ],
      [{ id: purchase_id }]
    );
    pool.mock(
      "UPDATE subscriptions SET status='active',current_period_start=$1,current_period_end=$2,latest_purchase_id=$3 WHERE id=$4",
      [
        dayjs(current_period_start).add(1, "month").toDate(),
        dayjs(current_period_end).add(1, "month").toDate(),
        purchase_id,
        subscription_id,
      ],
      []
    );

    const computed_purchase_id = await renewSubscription({
      account_id,
      subscription_id,
    });
    expect(computed_purchase_id).toBe(purchase_id);
    expect(pool.getUnused()).toEqual([]);
  });
});
