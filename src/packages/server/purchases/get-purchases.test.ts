/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
    expect(await getPurchases({ account_id })).toEqual([]);
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
    const p = await getPurchases({ account_id });
    expect(p.length).toBe(1);
    expect(p[0].cost).toBe(-100);
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

    const p = await getPurchases({ account_id, noCache: true });
    expect(p.length).toBe(2); // also counts above purchase
    const p_cutoff = await getPurchases({
      account_id,
      cutoff: dayjs().subtract(2, "month").toDate(),
      noCache: true,
    });
    expect(p_cutoff.length).toBe(2);

    const p_cutoff2 = await getPurchases({
      account_id,
      cutoff: dayjs().subtract(1, "week").toDate(),
      noCache: true,
    });
    expect(p_cutoff2.length).toBe(1);
  });
});
