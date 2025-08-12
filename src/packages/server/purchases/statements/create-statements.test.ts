/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createTestAccount } from "@cocalc/server/purchases/test-data";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { createStatements, _TEST_ } from "./create-statements";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import getStatements from "./get-statements";
import getPurchases from "../get-purchases";
import dayjs from "dayjs";
import { closeAndContinuePurchase } from "../project-quotas";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(before, 15000);
afterAll(after);

describe("creates an account, then creates purchases and statements", () => {
  const account_id = uuid();
  const project_id = uuid();
  const cost_per_hour1 = 1.25;

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

  let upgrade_purchase_id = -1;
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
      service: "license",
      description: {} as any,
      client: null,
      cost: 7,
    });

    // start pay-as-you-go project upgrade, which will
    // NOT be on the statement, because it's not closed.
    const period_start = dayjs(new Date()).subtract(30, "minutes").toDate();
    upgrade_purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "project-upgrade",
      period_start,
      cost_per_hour: cost_per_hour1,
      description: {
        type: "project-upgrade",
        start: period_start.valueOf(),
        project_id,
        quota: {} as any,
      },
    });
    // here we are manually setting the purchase time to the period_start time
    // from a half hour ago for testing purposes.
    await getPool().query("UPDATE purchases set time=$1 WHERE id=$2", [
      period_start,
      upgrade_purchase_id,
    ]);

    await delay(50); // so above purchase is on statement.
    await createStatements({ time: new Date(Date.now() - 1), interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(1);
    expect(statements[0].num_charges).toBe(1);
    expect(statements[0].total_charges).toBe(7);
    expect(statements[0].num_credits).toBe(1);
    expect(statements[0].total_credits).toBe(-10);
    expect(statements[0].balance).toBe(3);

    const { purchases } = await getPurchases({
      account_id,
      day_statement_id: statements[0].id,
    });
    expect(purchases.length).toBe(2);
    // @ts-ignore
    expect(purchases[0].cost + purchases[1].cost).toBe(-3);
  });

  it("close/continue the project-upgrade and make a statement", async () => {
    await closeAndContinuePurchase(upgrade_purchase_id);
    await delay(150); // so above purchase is on statement.
    await createStatements({ time: new Date(Date.now() - 1), interval: "day" });
    await delay(50);
    const statements = await getStatements({
      account_id,
      limit: 2,
      interval: "day",
    });
    expect(statements.length).toBe(2);

    const { purchases } = await getPurchases({
      account_id,
      day_statement_id: statements[0].id,
    });
    expect(purchases.length).toBe(1);
    expect(purchases[0].cost).toBeCloseTo(statements[0].total_charges, 3);
    expect(purchases[0].cost).toBeCloseTo(1.25 / 2, 2);
    const { purchases: allPurchases } = await getPurchases({ account_id });
    expect(allPurchases.length).toBe(4); // because of new one created by splitting existing one
  }, 10000);
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
      service: "license",
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
      service: "license",
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
