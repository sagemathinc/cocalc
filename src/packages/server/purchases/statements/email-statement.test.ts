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
    expect(subject).toMatch("Statement Ending");
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
});
