/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// test the automatic payments maintenance loop

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import maintainAutomaticPayments, {
  setMockCollectPayment,
} from "./maintain-automatic-payments";
import { uuid } from "@cocalc/util/misc";
import { createTestAccount } from "./test-data";

const collect: { account_id: string; amount: number }[] = [];
beforeAll(async () => {
  setMockCollectPayment(async ({ account_id, amount }) => {
    collect.push({ account_id, amount });
  });
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("testing automatic payments in several situations", () => {
  const account_id1 = uuid();

  it("runs a first round to clear out any left over statements", async () => {
    await maintainAutomaticPayments();
  });

  it("creates an account with a stripe_usage_subscription, creates a statement, and observes an automatic payment get made", async () => {
    await createTestAccount(account_id1);
    const pool = getPool();
    await pool.query(
      "UPDATE accounts SET stripe_usage_subscription='foo' WHERE account_id=$1",
      [account_id1]
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,-25,25,1,0,0)
      `,
      [account_id1]
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(collect).toEqual([{ account_id: account_id1, amount: 25 }]);
  });
});
