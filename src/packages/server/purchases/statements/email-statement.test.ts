/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import emailStatement from "./email-statement";
import { createTestAccount } from "@cocalc/server/purchases/test-data";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { createStatements } from "./create-statements";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import getStatements from "./get-statements";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("creates an account, then creates statements and corresponding emails and test that everything matches up", () => {
  const account_id = uuid();
  let firstStatementTime;
  it("creates an account, a purchase adding 10 credit, and a statement", async () => {
    await createTestAccount(account_id);
    // must have at least 1 purchase to make a statement.
    await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -10,
    });
    await delay(100); // so above purchase is on statement.
    firstStatementTime = new Date(Date.now() - 1);
    await createStatements({ time: firstStatementTime, interval: "day" });
  });

  it("creates one more transaction, then tries to make a statement with the exact same time and this does NOT get created", async () => {
    await delay(10);
    await createPurchase({
      account_id,
      service: "credit",
      description: { type: "credit" },
      client: null,
      cost: -0.01,
    });
    await delay(100); // so above purchase might be on statement
    await createStatements({ time: firstStatementTime, interval: "day" });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(1);
  });

  it("gets the one statement that was created above and creates the email", async () => {
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(1);
    const { to_ids, subject } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
    });
    expect(to_ids).toEqual([account_id]);
    expect(subject).toMatch("Daily Statement");
  });

  it("trying to send same statement immediately again is an error, but works with force", async () => {
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    try {
      await emailStatement({
        account_id,
        statement_id: statements[0].id,
        dryRun: true,
      });
    } catch (e) {
      expect(e.message).toMatch("already sent");
    }

    // but works with force
    await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
      force: true,
    });
  });

  it("Statement balance is not negative -- makes a monthly statement, which doesn't ask the user to make a payment since balance isn't low", async () => {
    // we won't get a statement if our closing date isn't today!
    // We directly set in database since the setClosingDay function only works on days 1-28, and we want to run
    // tests on any day!
    const pool = getPool();
    await pool.query(
      "UPDATE accounts SET purchase_closing_day = $1 WHERE account_id = $2",
      [new Date().getDate(), account_id],
    );
    // delete existing statements so that a new statement will get created.
    await pool.query("DELETE FROM statements WHERE account_id = $1", [
      account_id,
    ]);

    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { body, subject } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
      force: true,
    });
    expect(subject).toMatch("Monthly Statement");
    expect(body).toMatch("NO PAYMENT IS REQUIRED");
  });

  it("No payment is currently required. -- it sets min balance and makes a purchase that puts the balance below 0 but above the thresh to 'demand' payment.", async () => {
    const pool = getPool();
    await pool.query("UPDATE accounts SET min_balance=$1 WHERE account_id=$2", [
      -10,
      account_id,
    ]);
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 0.5,
    });
    await delay(100); // avoid clock issues
    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { body } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
      force: true,
    });
    expect(body).toMatch("NO PAYMENT IS REQUIRED");
  });

  it("Payment required -- makes a bigger purchase, then creates a monthly statement, which explicitly asks the user to make a payment", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 25,
    });
    await delay(100); // avoid clock issues
    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { body } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
      force: true,
    });
    expect(body).toMatch("invoice soon");
    expect(body).not.toMatch("NO PAYMENT IS REQUIRED");
  });
});
