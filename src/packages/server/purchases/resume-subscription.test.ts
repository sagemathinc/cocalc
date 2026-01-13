/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// test resuming a canceled subscription

import { uuid } from "@cocalc/util/misc";
import {
  createTestAccount,
  createTestMembershipSubscription,
  createTestSubscription,
} from "./test-data";
//import dayjs from "dayjs";
import resumeSubscription from "./resume-subscription";
import cancelSubscription from "./cancel-subscription";
import { getSubscription } from "./renew-subscription";
import getLicense from "@cocalc/server/licenses/get-license";
import getBalance from "./get-balance";
import { before, after } from "@cocalc/server/test";
import getPool from "@cocalc/database/pool";
import dayjs from "dayjs";
import { toDecimal } from "@cocalc/util/money";

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
    const balanceBeforeCancel = toDecimal(await getBalance({ account_id }));
    await cancelSubscription({
      account_id,
      subscription_id,
    });
    expect((await getSubscription(subscription_id)).status).toBe("canceled");
    // balance should not change.
    expect(toDecimal(await getBalance({ account_id })).toNumber()).toBeCloseTo(
      balanceBeforeCancel.toNumber(),
    );
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

describe("membership subscription cancel and resume", () => {
  const account_id = uuid();
  let subscription_id = -1;
  let membershipClass = "member";
  it("creates an account and membership subscription with expired period", async () => {
    await createTestAccount(account_id);
    const created = await createTestMembershipSubscription(account_id, {
      class: "member",
      start: dayjs().subtract(2, "month").toDate(),
      end: dayjs().subtract(1, "day").toDate(),
    });
    subscription_id = created.subscription_id;
    membershipClass = created.membershipClass;
  });

  it("cancels and resumes the membership subscription, creating a membership purchase", async () => {
    await cancelSubscription({
      account_id,
      subscription_id,
    });
    expect((await getSubscription(subscription_id)).status).toBe("canceled");
    const purchase_id = await resumeSubscription({ account_id, subscription_id });
    if (!purchase_id) {
      throw Error("expected a membership purchase_id");
    }
    expect((await getSubscription(subscription_id)).status).toBe("active");
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
