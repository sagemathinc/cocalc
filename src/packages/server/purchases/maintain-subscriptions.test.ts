import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import createAccount from "@cocalc/server/accounts/create-account";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import createSubscription from "./create-subscription";
import createPurchase from "./create-purchase";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import getSubscriptions from "./get-subscriptions";
import getBalance, { getPendingBalance } from "./get-balance";
import createCredit from "./create-credit";
import { test } from "./maintain-subscriptions";
import { license0 } from "./test-data";
import dayjs from "dayjs";

beforeAll(async () => {
  test.failOnError = true;
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test renewSubscriptions", () => {
  it("run renewSubscriptions and it doesn't crash", async () => {
    try {
      await test.renewSubscriptions();
    } catch (_) {
      // rare case that some muck left in database due to half-failed tests, so clean up
      // once and try again.  A little iffy do to tests running in parallel, but should
      // never happen if there is a clean slate.
      await initEphemeralDatabase({ reset: true });
      await test.renewSubscriptions();
    }
  });

  const account_id = uuid();
  const x: any = {};
  it("creates an account, license and subscription", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const info = getPurchaseInfo(license0);
    x.license_id = await createLicense(account_id, info);
    x.subscription_id = await createSubscription(
      {
        account_id,
        cost: 10,
        interval: "month",
        current_period_start: dayjs().toDate(),
        current_period_end: dayjs().add(1, "month").toDate(),
        status: "active",
        metadata: { type: "license", license_id: x.license_id },
        latest_purchase_id: 0,
      },
      null
    );
  });

  it("runs renewSubscriptions and checks that our subscription didn't renew yet", async () => {
    await test.renewSubscriptions();
    const subs = await getSubscriptions({ account_id });
    expect(
      Math.abs(subs[0].current_period_start.valueOf() - Date.now())
    ).toBeLessThan(1000 * 10);
  });

  it("modifies our subscription so the start date is a month ago and the end date is 12 hours from now", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE subscriptions SET current_period_start=$1, current_period_end=$2 WHERE id=$3",
      [
        dayjs().subtract(1, "month").toDate(),
        dayjs().add(12, "hour").toDate(),
        x.subscription_id,
      ]
    );
  });

  it("runs renewSubscriptions and checks that our subscription did renew", async () => {
    await test.renewSubscriptions();
    const subs = await getSubscriptions({ account_id });
    // within 3 days of a month from now:
    expect(
      Math.abs(
        subs[0].current_period_end.valueOf() -
          dayjs().add(1, "month").toDate().valueOf()
      )
    ).toBeLessThan(1000 * 3600 * 24 * 2);
    // within 3 days of now:
    expect(
      Math.abs(subs[0].current_period_start.valueOf() - Date.now())
    ).toBeLessThan(1000 * 3600 * 24 * 2);
    // the purchase should be pending so we don't have any money.
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT pending FROM purchases where id=$1",
      [subs[0].latest_purchase_id]
    );
    expect(rows[0].pending).toBe(true);
  });

  it("add some money and purchase should suddenly not be pending", async () => {
    await createCredit({ account_id, amount: 1000 });
    const subs = await getSubscriptions({ account_id });
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT pending FROM purchases where id=$1",
      [subs[0].latest_purchase_id]
    );
    expect(rows[0].pending).toBe(false);
  });

  it("reset the subscription period again, and do subscription renewal. This time purchase will NOT be pending since we have so much money.", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE subscriptions SET current_period_start=$1, current_period_end=$2 WHERE id=$3",
      [
        dayjs().subtract(1, "month").toDate(),
        dayjs().add(12, "hour").toDate(),
        x.subscription_id,
      ]
    );
    await test.renewSubscriptions();
    const subs = await getSubscriptions({ account_id });
    const y = await pool.query("SELECT pending FROM purchases where id=$1", [
      subs[0].latest_purchase_id,
    ]);
    expect(!!y.rows[0].pending).toBe(false);
  });
});

describe("test that updateStatus works as it should", () => {
  it("run updateStatus and it doesn't crash", async () => {
    await test.updateStatus();
  });

  const account_id = uuid();
  it("makes an account for testing", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
  });

  const x: any = {};

  it("create a new subscription, run updateStatus, and observe that it doesn't change the status", async () => {
    x.subscription_id = await createSubscription(
      {
        account_id,
        cost: 10,
        interval: "month",
        current_period_start: dayjs().toDate(),
        current_period_end: dayjs().add(1, "month").toDate(),
        status: "active",
        metadata: { type: "license", license_id: uuid() }, // fake
        latest_purchase_id: 0, // fake
      },
      null
    );
    await test.updateStatus();
    const subs = await getSubscriptions({ account_id });
    expect(subs[0].status).toBe("active");
  });

  it("modifies the subscription so current_period_end is within 1 day of now, runs updateStatus, and observe that it changes the status to unpaid", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE subscriptions SET current_period_start=NOW()-interval '1 month', current_period_end=NOW()+interval '1 day' WHERE id=$1",
      [x.subscription_id]
    );
    await test.updateStatus();
    const subs = await getSubscriptions({ account_id });
    expect(subs[0].status).toBe("unpaid");
  });

  it("modifies the subscription so current_period_end is in the past, runs updateStatus, and observe that it changes the status to past_due", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE subscriptions SET current_period_end=NOW()-interval '1 hour' WHERE id=$1",
      [x.subscription_id]
    );
    await test.updateStatus();
    const subs = await getSubscriptions({ account_id });
    expect(subs[0].status).toBe("past_due");
  });

  it("modifies the subscription so current_period_end is at least grace period does in the past, runs updateStatus, and observe that it changes the status to canceled", async () => {
    const grace = await test.getGracePeriodDays();
    const pool = getPool();
    await pool.query(
      `UPDATE subscriptions SET current_period_end=NOW()-interval '${
        grace + 1
      } days' WHERE id=$1`,
      [x.subscription_id]
    );
    await test.updateStatus();
    const subs = await getSubscriptions({ account_id });
    expect(subs[0].status).toBe("canceled");
  });
});

describe("testing cancelAllPendingSubscriptions works as it should", () => {
  const account_id = uuid();

  it("run cancelAllPendingSubscriptions when there might be nothing pending in the database works; this gives us a clean slate", async () => {
    await test.cancelAllPendingSubscriptions();
  });

  it("makes an account for testing", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
  });

  const x: any = {};
  it("creates a license", async () => {
    const info = getPurchaseInfo(license0);
    x.license_id = await createLicense(account_id, info);
    x.cost = compute_cost(info).discounted_cost;
  });

  it("creates purchase of that license", async () => {
    x.purchase_id = await createPurchase({
      account_id,
      // we make the service "edit-license" since that's what it is for *renewing* a subscription for a license.
      service: "edit-license",
      description: {} as any,
      client: null,
      cost: x.cost,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-x.cost, 2);
  });

  it("creates a subscription for that license", async () => {
    x.subscription_id = await createSubscription(
      {
        account_id,
        cost: x.cost,
        interval: "month",
        current_period_start: dayjs().toDate(),
        current_period_end: dayjs().add(1, "month").toDate(),
        status: "active",
        metadata: { type: "license", license_id: x.license_id },
        latest_purchase_id: x.purchase_id,
      },
      null
    );
  });

  it("run cancelAllPendingSubscriptions and verifies our subscription is not canceled", async () => {
    await test.cancelAllPendingSubscriptions();
    const subs = await getSubscriptions({ account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");
  });

  it("marks the payment as pending (for testing purposes)", async () => {
    expect(await getBalance(account_id)).toBeCloseTo(-x.cost, 2);
    const pool = getPool();
    await pool.query("UPDATE purchases SET pending=true WHERE id=$1", [
      x.purchase_id,
    ]);
    expect(await getBalance(account_id)).toBe(0);
    expect(await getPendingBalance(account_id)).toBeCloseTo(-x.cost, 2);
  });

  it("verifies that cancelAllPendingSubscriptions still doesn't touch it (since only pending for a moment)", async () => {
    await test.cancelAllPendingSubscriptions();
    const subs = await getSubscriptions({ account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");
  });

  it("change time of purchase back one day less than grace period and verifies that cancelAllPendingSubscriptions doesn't cancel it", async () => {
    const grace = await test.getGracePeriodDays();
    expect(grace).toBeGreaterThanOrEqual(1);
    const pool = getPool();
    await pool.query(
      `UPDATE purchases SET time=NOW() - interval '${
        grace - 1
      } days' WHERE id=$1`,
      [x.purchase_id]
    );
    await test.cancelAllPendingSubscriptions();
    const subs = await getSubscriptions({ account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");
  });

  it("change time of purchase back to slightly more than grace period and verifies that cancelAllPendingSubscriptions does properly cancel it", async () => {
    const grace = await test.getGracePeriodDays();
    const pool = getPool();
    await pool.query(
      `UPDATE purchases SET time=NOW() - interval '${
        grace + 1
      } days' WHERE id=$1`,
      [x.purchase_id]
    );
    await test.cancelAllPendingSubscriptions();
    const subs = await getSubscriptions({ account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("canceled");
  });

  it("confirms that account was properly credited", async () => {
    expect(await getPendingBalance(account_id)).toBe(0);
    // this shouldn't be exactly 0 -- cancelling waits a few minutes
    // and there is a penny or two charge.
    expect(Math.abs(await getBalance(account_id)) < 0.05).toBe(true);
    expect(Math.abs(await getBalance(account_id))).toBeLessThan(0.05);
  });
});
