/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createTestAccount } from "@cocalc/server/purchases/test-data";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { createStatements, _TEST_ } from "./create-statements";
import { toDecimal } from "@cocalc/util/money";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import getStatements from "./get-statements";
import getPurchases from "../get-purchases";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("creates an account, then creates purchases and statements", () => {
  const account_id = uuid();

  it("creates an account, run statements and get none since no purchases", async () => {
    await createTestAccount(account_id);
    await createStatements({ time: new Date(Date.now() - 1), interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(0);
  });

  it("add some purchases, run statements and check properties", async () => {
    // a credit of 10
    await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -10,
    });

    // a spend of 7
    await createPurchase({
      account_id,
      service: "student-pay",
      description: {} as any,
      client: null,
      cost: 7,
    });

    await delay(50); // so above purchase is on statement.
    await createStatements({ time: new Date(Date.now() - 1), interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(1);
    expect(statements[0].num_charges).toBe(1);
    expect(toDecimal(statements[0].total_charges).toNumber()).toBe(7);
    expect(statements[0].num_credits).toBe(1);
    expect(toDecimal(statements[0].total_credits).toNumber()).toBe(-10);
    expect(toDecimal(statements[0].balance).toNumber()).toBe(3);

    const { purchases } = await getPurchases({
      account_id,
      day_statement_id: statements[0].id,
    });
    expect(purchases.length).toBe(2);
    const purchaseTotal = toDecimal(purchases[0].cost!).add(purchases[1].cost!);
    expect(purchaseTotal.toNumber()).toBe(-3);
  });

});

describe("creates an account, then creates purchases and statements and ensures that there aren't multiple statements per day", () => {
  const account_id = uuid();

  it("creates an account", async () => {
    await createTestAccount(account_id);
  });

  let time;
  it("adds two purchases, make statement", async () => {
    // a credit of 10
    await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -10,
    });

    // a spend of 7
    await createPurchase({
      account_id,
      service: "student-pay",
      description: {} as any,
      client: null,
      cost: 7,
    });

    await delay(50); // so above purchase is on statement.
    time = new Date(Date.now() - 1); // 1ms ago
    await createStatements({ time, interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 10,
      interval: "day",
    });
    // there is 1 statement now:
    expect(statements.length).toBe(1);
  });

  it("add another credit and purchase", async () => {
    const id1 = await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -10,
    });
    const id2 = await createPurchase({
      account_id,
      service: "student-pay",
      description: {} as any,
      client: null,
      cost: 1,
    });
    // make it so the above purchases happened before cutoff time.
    const t = new Date(time.valueOf() - 50);
    await getPool().query("UPDATE purchases set time=$1 WHERE id=$2", [t, id1]);
    await getPool().query("UPDATE purchases set time=$1 WHERE id=$2", [t, id2]);
    _TEST_.lastCalled.clear();
    await createStatements({ time, interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 10,
      interval: "day",
    });
    // there is still only 1 statement:
    expect(statements.length).toBe(1);
  });
  it("What *should* happen is purchases id1,id2 should get put on the next statement with a different time", async () => {
    await delay(50);
    const time2 = new Date(Date.now() - 1); // 1ms ago
    _TEST_.lastCalled.clear();
    await createStatements({ time: time2, interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 10,
      interval: "day",
    });
    expect(statements.length).toBe(2);
  });
});
