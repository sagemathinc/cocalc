/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// test the automatic payments maintenance loop

import maintainAutomaticPayments, {
  setMockCollectPayment,
} from "./maintain-automatic-payments";
import { uuid } from "@cocalc/util/misc";
import { createTestAccount } from "./test-data";
import createCredit from "./create-credit";
import { getServerSettings } from "@cocalc/database/settings";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
  setMockCollectPayment(async ({ account_id, amount }) => {
    collect.push({ account_id, amount });
  });
}, 15000);

afterAll(after);

const collect: { account_id: string; amount: number }[] = [];

describe("testing automatic payments in several situations", () => {
  const account_id1 = uuid();
  const account_id2 = uuid();
  const pool = getPool();

  it("runs a first round to clear out any left over statements", async () => {
    await maintainAutomaticPayments();
  });

  it("creates an account with a stripe_usage_subscription, creates a statement, and an automatic payment gets triggered", async () => {
    await createTestAccount(account_id1);
    await pool.query(
      "UPDATE accounts SET stripe_usage_subscription='foo' WHERE account_id=$1",
      [account_id1],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,-25,25,1,0,0)
      `,
      [account_id1],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(collect).toEqual([{ account_id: account_id1, amount: 25 }]);
  });

  it("creates an account without a stripe_usage_subscription, creates a statement, and it does not trigger a payment", async () => {
    await createTestAccount(account_id2);
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,-25,25,1,0,0)
      `,
      [account_id2],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(collect).toEqual([]);
  });

  it("creates a statement with a positive balance for a user with stripe_usage_subscription, and it doesn't trigger a payment.", async () => {
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,25,0,0,25,1)
      `,
      [account_id1],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(collect).toEqual([]);
  });

  it("creates statement for first user with negative balance, and also add automatic payments for second user, and see 2 payments get triggered", async () => {
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,-389,389,1,0,0)
      `,
      [account_id1],
    );
    await pool.query(
      "UPDATE accounts SET stripe_usage_subscription='bar' WHERE account_id=$1",
      [account_id2],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(new Set(collect)).toEqual(
      new Set([
        { account_id: account_id1, amount: 389 },
        { account_id: account_id2, amount: 25 },
      ]),
    );
  });

  it("creates older statements for both accounts that aren't paid and new statements that also aren't paid, and confirms that ONLY the newest statement triggers paymentin each case", async () => {
    // older ones:

    // the newest ones that both need to be paid
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW()-interval '1 day',$1,-3890,3890,1,0,0)
      `,
      [account_id1],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW()-interval '1 day',$1,-250,250,1,0,0)
      `,
      [account_id2],
    );

    // the newest ones that both need to be paid
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW()+interval '1 day',$1,-389,389,1,0,0)
      `,
      [account_id1],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW()+interval '1 day',$1,-25,25,1,0,0)
      `,
      [account_id2],
    );

    collect.length = 0;
    await maintainAutomaticPayments();
    expect(new Set(collect)).toEqual(
      new Set([
        { account_id: account_id1, amount: 389 },
        { account_id: account_id2, amount: 25 },
      ]),
    );
  });

  // we changed things for now to NOT take into account credit,
  // to make how much is charged easier to understand and automate.
  it("creates a statement from a day ago that owes $25, then credits the account for $10, and confirms that collecting triggers a collection of $25, thus NOT taking into account the credit", async () => {
    // clean up all the statements for these two accounts
    await pool.query(
      "DELETE from statements WHERE account_id=$1 OR account_id=$2",
      [account_id1, account_id2],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW()-interval '1 day',$1,-25,25,1,0,0)
      `,
      [account_id1],
    );

    await createCredit({ account_id: account_id1, amount: 10 });
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(new Set(collect)).toEqual(
      new Set([{ account_id: account_id1, amount: 25 }]),
    );
  });

  it("creates a statement with interval 'day' and observes that it is ignored", async () => {
    // clean up all the statements for these two accounts
    await pool.query(
      "DELETE from statements WHERE account_id=$1 OR account_id=$2",
      [account_id1, account_id2],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('day',NOW()-interval '1 day',$1,-389,389,1,0,0)
      `,
      [account_id1],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    expect(collect).toEqual([]);
  });

  it("creates a new user with a statement that has a |balance| less than pay_as_you_go_min_payment, and sees that it dos get automatically billed, but increased to pay_as_you_go_min_payment.", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const account_id = uuid();
    await createTestAccount(account_id);
    await pool.query(
      "UPDATE accounts SET stripe_usage_subscription='foo' WHERE account_id=$1",
      [account_id],
    );
    await pool.query(
      `INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits)
                      values('month',NOW(),$1,$2,$3,1,0,0)
      `,
      [
        account_id,
        -(pay_as_you_go_min_payment - 1),
        pay_as_you_go_min_payment - 1,
      ],
    );
    collect.length = 0;
    await maintainAutomaticPayments();
    // DO NOT collect whne amount is less than pay as you go min
    expect(collect).toEqual([]);
  });
});
