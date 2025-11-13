/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import createAccount from "@cocalc/server/accounts/create-account";
import createPurchase from "./create-purchase";
import getPurchases from "./get-purchases";
import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import dayjs from "dayjs";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("creates and get purchases using various options", () => {
  const account_id = uuid();

  it("gets purchases for an account that doesn't exist yet (fine, there aren't any)", async () => {
    const { purchases } = await getPurchases({ account_id });
    expect(purchases).toEqual([]);
  });

  it("creates account and a purchase and gets it", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -100,
    });
    const { purchases: p } = await getPurchases({ account_id });
    expect(p.length).toBe(1);
    expect(p[0].cost).toBe(-100);
  });

  it("gets purchase along with email address", async () => {
    const email_address = `${account_id}@cocalc.com`;
    const pool = getPool();
    await pool.query(
      "UPDATE accounts SET email_address=$1 WHERE account_id=$2",
      [email_address, account_id],
    );
    const { purchases: p } = await getPurchases({
      account_id,
      includeName: true,
    });
    expect(p.length).toBe(1);
    expect(p[0].email_address).toBe(email_address);
    expect(p[0].first_name).toBe("Test");
    expect(p[0].last_name).toBe("User");
  });

  it("tests cutoff param by creating another older purchase then gets it and also filters it using cutoff", async () => {
    const purchase_id = await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 5,
    });
    const pool = getPool();
    const month_ago = dayjs().subtract(1, "month").toDate();
    await pool.query("UPDATE purchases SET time=$1 WHERE id=$2", [
      month_ago,
      purchase_id,
    ]);

    const { purchases: p } = await getPurchases({ account_id });
    expect(p.length).toBe(2); // also counts above purchase
    const { purchases: p_cutoff } = await getPurchases({
      account_id,
      cutoff: dayjs().subtract(2, "month").toDate(),
    });
    expect(p_cutoff.length).toBe(2);

    const { purchases: p_cutoff2 } = await getPurchases({
      account_id,
      cutoff: dayjs().subtract(1, "week").toDate(),
    });
    expect(p_cutoff2.length).toBe(1);
  });
});
