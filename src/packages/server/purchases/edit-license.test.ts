/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import dayjs from "dayjs";

import { getPoolClient } from "@cocalc/database/pool";
import createAccount from "@cocalc/server/accounts/create-account";
import getLicense from "@cocalc/server/licenses/get-license";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { uuid } from "@cocalc/util/misc";
import createPurchase from "./create-purchase";
import editLicense from "./edit-license";
import editLicenseOwner from "./edit-license-owner";
import getSubscriptions from "./get-subscriptions";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import { license0 } from "./test-data";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("create a license and then edit it in various ways", () => {
  const account_id = uuid();

  const x = { license_id: "" };

  it("create an account and a license so we can edit it", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const info = getPurchaseInfo(license0);
    x.license_id = await createLicense(account_id, info);
  });

  it("tries and fail to extend expire date. Should fail since our new account has a balance of 0.", async () => {
    const end = dayjs().add(2, "months").toDate();
    await expect(
      async () =>
        await editLicense({
          account_id,
          license_id: x.license_id,
          changes: { end },
        }),
    ).rejects.toThrow();
  });

  it("Edit license in a way that adds credit to our new account by shrinking the dates", async () => {
    const end = dayjs().add(2, "weeks").toDate();
    const { purchase_id, cost } = await editLicense({
      account_id,
      license_id: x.license_id,
      changes: { end },
    });
    expect(purchase_id).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0);
    const license = await getLicense(x.license_id, account_id);
    expect(license.is_manager).toBe(true);
    expect(license.number_running).toBe(0);
    expect(new Date(license.activates ?? 0).toISOString()).toBe(
      license0.range[0],
    );
    expect(new Date(license.expires ?? 0).toISOString()).toBe(
      end.toISOString(),
    );
  });

  it("add some money then edit license by increasing all the quotas and confirm that all changed as requested", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -1000,
    });
    const changes = {
      end: dayjs().add(2, "month").toDate(),
      start: dayjs().add(2, "week").toDate(),
      quantity: 2,
      custom_ram: 8,
      custom_disk: 9,
      custom_cpu: 2,
      custom_member: false,
      custom_uptime: "medium",
    } as const;
    const { purchase_id, cost } = await editLicense({
      account_id,
      license_id: x.license_id,
      changes,
    });
    expect(purchase_id).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(0);
    const license = await getLicense(x.license_id, account_id);
    expect(new Date(license.activates ?? 0).toISOString()).toBe(
      changes.start.toISOString(),
    );
    expect(new Date(license.expires ?? 0).toISOString()).toBe(
      changes.end.toISOString(),
    );
    const { quota } = license;
    if (quota == null) throw Error("bug");
    expect(quota.cpu).toBe(changes.custom_cpu);
    expect(quota.disk).toBe(changes.custom_disk);
    expect(quota.ram).toBe(changes.custom_ram);
    expect(license.run_limit).toBe(changes.quantity);
    expect(quota.member).toBe(changes.custom_member);
    expect(quota.idle_timeout).toBe(changes.custom_uptime);
  });

  it("set start date to now", async () => {
    const start = dayjs().toDate();
    await editLicense({
      account_id,
      license_id: x.license_id,
      changes: { start },
    });
  });

  it("set start date to 1 hour ago, then try to change start date (which is now in solidly in past) and get error", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE site_licenses SET activates=NOW() - interval '1 hour' WHERE id=$1",
      [x.license_id],
    );
    const start = dayjs().add(1, "week").toDate();
    await expect(
      async () =>
        await editLicense({
          account_id,
          license_id: x.license_id,
          changes: { start },
        }),
    ).rejects.toThrow();
  });

  it("verify that only the owner of license can edit it", async () => {
    const end = dayjs().add(1, "week").toDate();
    await expect(
      async () =>
        await editLicense({
          account_id: uuid(),
          license_id: x.license_id,
          changes: { end },
        }),
    ).rejects.toThrow();
  });
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

  it("make a subscription", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id: item.account_id,
    });
    const client = await getPoolClient();
    await purchaseShoppingCartItem(item as any, client);
    client.release();
  });

  it("gets our subscription and license, then edits the license in a way that changes the subscription cost", async () => {
    await createPurchase({
      account_id: item.account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -1000,
    });
    const subs = await getSubscriptions({ account_id: item.account_id });
    expect(subs.length).toBe(1);
    expect(subs[0].status).toBe("active");
    const license_id = subs[0].metadata.license_id;
    await editLicense({
      account_id: item.account_id,
      license_id,
      changes: { custom_ram: 8, custom_cpu: 1 },
    });
    const subs2 = await getSubscriptions({ account_id: item.account_id });
    const cost2 = computeCost({
      cpu: 1,
      ram: 8,
      disk: 3,
      type: "quota",
      user: "academic",
      boost: false,
      member: true,
      period: "monthly",
      uptime: "short",
      run_limit: 1,
    } as any);

    // the monthly cost doesn't change *exactly* as the cost to edit, due
    // to the date range, particular month, etc.  Other tests that do
    // test exact cost changes exist below!
    expect(subs2[0].cost).toBeCloseTo(cost2?.cost ?? 0, -1);
  });
});

describe("testing changing the owner of a license", () => {
  const account_id = uuid();

  const x = { license_id: "" };

  it("create an account and a license", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const info = getPurchaseInfo(license0);
    x.license_id = await createLicense(account_id, info);
  });

  const new_account_id = uuid();

  it("make account_id an admin and try empty change ", async () => {
    const pool = getPool();
    await pool.query(
      "update accounts set groups='{admin}' where account_id=$1",
      [account_id],
    );
    const { rows } = await pool.query(
      "SELECT info FROM site_licenses WHERE id=$1",
      [x.license_id],
    );
    await editLicenseOwner({
      account_id,
      new_account_id: account_id,
      license_id: x.license_id,
    });
    const { rows: rows2 } = await pool.query(
      "SELECT info FROM site_licenses WHERE id=$1",
      [x.license_id],
    );
    // no change
    expect(rows).toEqual(rows2);
  });

  it("make a real change", async () => {
    await editLicenseOwner({
      account_id,
      new_account_id,
      license_id: x.license_id,
    });
  });

  it("verify that changing the owner worked", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT info FROM site_licenses WHERE id=$1",
      [x.license_id],
    );
    expect(rows[0].info.purchased.account_id).toBe(new_account_id);
  });

  it("attempt to change the owner of the license as a non-admin fails", async () => {
    expect(async () => {
      await editLicenseOwner({
        account_id: new_account_id,
        new_account_id: account_id,
        license_id: x.license_id,
      });
    }).rejects.toThrow("admin");
  });

  it("clear the info field and confirm that editing still works (for manual purchased licenses from before)", async () => {
    const pool = getPool();
    await pool.query("UPDATE site_licenses SET info=null WHERE id=$1", [
      x.license_id,
    ]);
    await editLicenseOwner({
      account_id,
      new_account_id,
      license_id: x.license_id,
    });
    const { rows } = await pool.query(
      "SELECT info FROM site_licenses WHERE id=$1",
      [x.license_id],
    );
    expect(rows[0].info.purchased.account_id).toBe(new_account_id);
  });
});
