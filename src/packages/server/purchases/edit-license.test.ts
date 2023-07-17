/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import createLicense from "@cocalc/server/licenses/purchase/create-license";
import createAccount from "@cocalc/server/accounts/create-account";
import editLicense from "./edit-license";
import getLicense from "@cocalc/server/licenses/get-license";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import createPurchase from "./create-purchase";
import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import dayjs from "dayjs";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("create a license and then edit it in various ways", () => {
  const account_id = uuid();

  const description = {
    cpu: 1,
    ram: 2,
    disk: 3,
    type: "quota",
    user: "academic",
    boost: true,
    range: [
      dayjs().add(1, "week").toISOString(),
      dayjs().add(1, "month").toISOString(),
    ],
    title: "as",
    member: true,
    period: "range",
    uptime: "short",
    run_limit: 1,
    description: "xxxx",
  } as const;

  const x = { license_id: "" };

  it("create an account and a license so we can edit it", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const info = getPurchaseInfo(description);
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
        })
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
      description.range[0]
    );
    expect(new Date(license.expires ?? 0).toISOString()).toBe(
      end.toISOString()
    );
  });

  it("add some money then edit license by increasing all the quotas and confirm that all changed as requested", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
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
      changes.start.toISOString()
    );
    expect(new Date(license.expires ?? 0).toISOString()).toBe(
      changes.end.toISOString()
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

  it("try to change start date (which is now in past) and get error", async () => {
    const start = dayjs().add(1, "week").toDate();
    await expect(
      async () =>
        await editLicense({
          account_id,
          license_id: x.license_id,
          changes: { start },
        })
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
        })
    ).rejects.toThrow();
  });
});

// describe("create a subscription license and edit it and confirm the subscription cost changes", () => {
//   const account_id = uuid();
// });
