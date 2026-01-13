/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import createAccount from "@cocalc/server/accounts/create-account";
import getLicense from "@cocalc/server/licenses/get-license";
import { uuid } from "@cocalc/util/misc";
import { getPoolClient } from "@cocalc/database/pool";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { getClosingDay, setClosingDay } from "./closing-date";
import getSubscriptions from "./get-subscriptions";
import getBalance from "./get-balance";
import dayjs from "dayjs";
import cancelSubscription from "./cancel-subscription";
import resumeSubscription from "./resume-subscription";
import createPurchase from "./create-purchase";
import { before, after, getPool } from "@cocalc/server/test";
import { createTestMembershipSubscription } from "./test-data";
import { round2up } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";

const MEMBER_TIER = `member-test-${uuid().slice(0, 8)}`;
const PRO_TIER = `pro-test-${uuid().slice(0, 8)}`;

beforeAll(async () => {
  await before({ noConat: true });
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO membership_tiers
      (id, label, store_visible, priority, price_monthly, price_yearly,
       project_defaults, llm_limits, features, disabled, notes)
    VALUES
      ($1, 'Member', true, 10, 100, 0, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false, ''),
      ($2, 'Pro', true, 20, 200, 0, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, false, '')
    ON CONFLICT (id) DO UPDATE
      SET label=EXCLUDED.label,
          store_visible=EXCLUDED.store_visible,
          priority=EXCLUDED.priority,
          price_monthly=EXCLUDED.price_monthly,
          price_yearly=EXCLUDED.price_yearly,
          project_defaults=EXCLUDED.project_defaults,
          llm_limits=EXCLUDED.llm_limits,
          features=EXCLUDED.features,
          disabled=EXCLUDED.disabled,
          notes=EXCLUDED.notes
    `,
    [MEMBER_TIER, PRO_TIER],
  );
}, 15000);
afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM membership_tiers WHERE id = $1", [MEMBER_TIER]);
  await pool.query("DELETE FROM membership_tiers WHERE id = $1", [PRO_TIER]);
  await after();
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
    // to ensure that prorated costs are NOT triggered anymore.
    let day = new Date().getDate() + 2;
    if (day > 28) {
      day = 1;
    }
    await setClosingDay(item.account_id, day);
    expect(await getClosingDay(item.account_id)).toBe(day);
    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
    client.release();
  });

  it("checks that that day of the end date of the license (and subscription period) is about 30 days  from today -- this now has nothing to do with the closing date for the account statement", async () => {
    const subs = await getSubscriptions({ account_id: item.account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");

    const n = dayjs(subs[0].current_period_end).diff(dayjs(), "days");
    expect(Math.abs(n - 30)).toBeLessThan(3);

    const metadata = subs[0].metadata;
    if (metadata.type != "license") {
      throw Error("expected license subscription");
    }
    const license_id = metadata.license_id;
    const license = await getLicense(license_id);
    expect(license.expires).toBe(subs[0].current_period_end.valueOf());
    // The cost of the license should be close to the monthly subscription,
    // as there is no proration and setting the close day above doesn't impact this!
    expect(
      toDecimal(await getBalance({ account_id: item.account_id }))
        .abs()
        .toNumber(),
    ).toBeCloseTo(toDecimal(subs[0].cost).toNumber(), -1);
  });

  it("cancels subscription and verifies that balance is unchanged", async () => {
    const subs = await getSubscriptions({ account_id: item.account_id });
    const { id: subscription_id } = subs[0];
    const before = toDecimal(await getBalance({ account_id: item.account_id }));
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
    });
    expect(
      toDecimal(await getBalance({ account_id: item.account_id })).toNumber(),
    ).toBeCloseTo(before.toNumber());
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

    await createPurchase({
      account_id: item.account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -100000,
    });

    // balance starts at 100K
    expect(
      toDecimal(await getBalance({ account_id: item.account_id })).toNumber(),
    ).toBeCloseTo(100000, 0);

    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
    client.release();

    const subs = await getSubscriptions({ account_id: item.account_id });
    const { id: subscription_id } = subs[0];
    await cancelSubscription({
      account_id: item.account_id,
      subscription_id,
    });
    await resumeSubscription({
      account_id: item.account_id,
      subscription_id,
    });
  });
});

describe("membership upgrade pricing (member -> pro with prorated credit)", () => {
  it("applies a prorated credit when upgrading via shopping cart", async () => {
    const account_id = uuid();
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });

    const pool = getPool();
    const start = dayjs().subtract(10, "day").toDate();
    const end = dayjs().add(20, "day").toDate();
    const existingCost = 100;
    const { subscription_id: existingSubId } =
      await createTestMembershipSubscription(account_id, {
        class: MEMBER_TIER,
        interval: "month",
        start,
        end,
        cost: existingCost,
      });

    const item = {
      account_id,
      id: 501,
      added: new Date(),
      product: "membership",
      description: {
        type: "membership",
        class: PRO_TIER,
        interval: "month",
      },
      cost: {} as any,
    };

    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
    client.release();

    const subs = await getSubscriptions({ account_id });
    const newSub = subs.find(
      (sub) =>
        sub.metadata?.type === "membership" &&
        sub.metadata?.class === PRO_TIER,
    );
    const oldSub = subs.find((sub) => sub.id === existingSubId);
    if (!newSub || !oldSub) {
      throw Error("expected both old and new membership subscriptions");
    }
    expect(oldSub.status).toBe("canceled");
    if (newSub.metadata?.type !== "membership") {
      throw Error("expected membership metadata");
    }
    expect(newSub.metadata.class).toBe(PRO_TIER);

    const elapsedFraction = Math.max(
      0,
      Math.min(
        1,
        (new Date(end).valueOf() - Date.now()) /
          (new Date(end).valueOf() - new Date(start).valueOf()),
      ),
    );
    const expectedRefund = round2up(existingCost * elapsedFraction);
    const expectedCharge = Math.max(0, round2up(200 - expectedRefund));

    const { rows } = await pool.query(
      "SELECT cost, description FROM purchases WHERE account_id=$1 AND service='membership' ORDER BY id DESC LIMIT 1",
      [account_id],
    );
    expect(rows.length).toBe(1);
    expect(toDecimal(rows[0].cost).toNumber()).toBeCloseTo(expectedCharge, 2);
    expect(rows[0].description?.type).toBe("membership");
    expect(rows[0].description?.class).toBe(PRO_TIER);
  });
});

describe("membership purchase via shopping cart", () => {
  it("creates a membership subscription and purchase", async () => {
    const account_id = uuid();
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });

    let client: Awaited<ReturnType<typeof getPoolClient>> | undefined;
    try {
      client = await getPoolClient();
      const item = {
        account_id,
        id: 601,
        added: new Date(),
        product: "membership",
        description: {
          type: "membership",
          class: MEMBER_TIER,
          interval: "month",
        },
        cost: {} as any,
      };

      await purchaseShoppingCartItem(item as any, client);

      const subs = await getSubscriptions({ account_id });
      const sub = subs.find(
        (s) =>
          s.metadata?.type === "membership" &&
          s.metadata?.class === MEMBER_TIER,
      );
      if (!sub) {
        throw Error("expected membership subscription");
      }
      expect(sub.status).toBe("active");

      const { rows } = await client.query(
        "SELECT cost, description FROM purchases WHERE account_id=$1 AND service='membership' ORDER BY id DESC LIMIT 1",
        [account_id],
      );
      expect(rows.length).toBe(1);
      expect(toDecimal(rows[0].cost).toNumber()).toBeCloseTo(100, 2);
      expect(rows[0].description?.type).toBe("membership");
      expect(rows[0].description?.class).toBe(MEMBER_TIER);
    } finally {
      client?.release();
    }
  });
});
