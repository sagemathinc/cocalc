import { uuid } from "@cocalc/util/misc";
import getPool, {
  getPoolClient,
  initEphemeralDatabase,
} from "@cocalc/database/pool";
import createAccount from "@cocalc/server/accounts/create-account";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import createSubscription from "./create-subscription";
import createPurchase from "./create-purchase";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import getSubscriptions from "./get-subscriptions";
import getBalance, { getPendingBalance } from "./get-balance";
import { test } from "./maintain-subscriptions";
import { license0 } from "./test-data";
import dayjs from "dayjs";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("testing cancelAllPendingSubscriptions works as it should", () => {
  const account_id = uuid();
  test.failOnError = true;

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
    const client = await getPoolClient();
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
      client
    );
    client.release();
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
