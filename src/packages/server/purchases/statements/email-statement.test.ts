/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import emailStatement from "./email-statement";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { createTestAccount } from "@cocalc/server/purchases/test-data";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { createStatements } from "./create-statements";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import getStatements from "./get-statements";
import { setClosingDay } from "../closing-date";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("creates an account, then creates statements and corresponding emails and test that everything matches up", () => {
  const account_id = uuid();
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
    await delay(50); // so above purchase is on statement.
    await createStatements({ time: new Date(Date.now() - 1), interval: "day" });
  });

  it("gets the one statement that was created above and creates the email", async () => {
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "day",
    });
    expect(statements.length).toBe(1);
    const { to, subject } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
    });
    expect(to).toMatch("@test.com");
    expect(subject).toMatch("Daily Statement");
  });

  it("trying to send same statement immediately again is an error, but works with force", async () => {
    expect.assertions(1);
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
    await setClosingDay(account_id, new Date().getDate());
    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { text, subject } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
    });
    expect(subject).toMatch("Monthly Statement");
    expect(text).toMatch("Statement balance is not negative, so no payment is required.");
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
      client: null,
      cost: 11,
    });
    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { text } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
    });
    expect(text).toMatch("No payment is currently required.");
  });

  it("Payment required -- makes a bigger purchase, then creates a monthly statement, which explicitly asks the user to make a payment", async () => {
    await createPurchase({
      account_id,
      service: "license",
      client: null,
      cost: 12,
    });
    await createStatements({
      time: new Date(Date.now() - 1),
      interval: "month",
    });
    const statements = await getStatements({
      account_id,
      limit: 1,
      interval: "month",
    });
    const { text } = await emailStatement({
      account_id,
      statement_id: statements[0].id,
      dryRun: true,
    });
    expect(text).toMatch("Payment required.");
  });
});
