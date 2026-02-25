/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import type { CreateSsoAccountOpts, PostgreSQL } from "../types";

describe("create_sso_account", () => {
  const database: PostgreSQL = db();
  let pool: any;

  async function createSsoAccountWrapper(
    opts: CreateSsoAccountOpts,
  ): Promise<string> {
    return callback_opts(database.create_sso_account.bind(database))(opts);
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup(database);
  });

  it("creates an account with passport information", async () => {
    const passport_strategy = `test-${uuid()}`;
    const passport_id = uuid();
    const passport_profile = { provider: "test", id: passport_id };
    const email_address = `SSO+${Date.now()}@Example.com`;
    const usage_intent = "sso-test";
    const created_by = "127.0.0.1";

    const account_id = await createSsoAccountWrapper({
      first_name: "Ada",
      last_name: "Lovelace",
      email_address,
      created_by,
      passport_strategy,
      passport_id,
      passport_profile,
      usage_intent,
    });

    const { rows } = await pool.query(
      "SELECT email_address, passports, sign_up_usage_intent, created_by, first_name, last_name FROM accounts WHERE account_id = $1",
      [account_id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].email_address).toBe(email_address.toLowerCase());
    expect(rows[0].sign_up_usage_intent).toBe(usage_intent);
    expect(rows[0].created_by).toBe(created_by);
    expect(rows[0].first_name).toBe("Ada");
    expect(rows[0].last_name).toBe("Lovelace");

    const passport_key = `${passport_strategy}-${passport_id}`;
    expect(rows[0].passports[passport_key]).toEqual(passport_profile);
  });

  it("creates an account without a passport", async () => {
    const email_address = `NO-PASSPORT-${Date.now()}@Example.com`;
    const lti_id = [uuid(), uuid()];

    const account_id = await createSsoAccountWrapper({
      first_name: "Grace",
      last_name: "Hopper",
      email_address,
      lti_id,
    });

    const { rows } = await pool.query(
      "SELECT email_address, lti_id, passports FROM accounts WHERE account_id = $1",
      [account_id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].email_address).toBe(email_address.toLowerCase());
    expect(rows[0].lti_id).toEqual(lti_id);
    expect(rows[0].passports).toBeNull();
  });

  it("rejects invalid names", async () => {
    await expect(
      createSsoAccountWrapper({
        first_name: "OPEN http://foo.com",
      }),
    ).rejects.toMatch("first_name not valid");
  });

  it("rejects repeated passport creation attempts", async () => {
    const passport_strategy = `repeat-${uuid()}`;
    const passport_id = uuid();

    await createSsoAccountWrapper({
      first_name: "Repeat",
      last_name: "Test",
      email_address: `repeat-${Date.now()}@example.com`,
      passport_strategy,
      passport_id,
      passport_profile: { id: passport_id },
    });

    await expect(
      createSsoAccountWrapper({
        first_name: "Repeat",
        last_name: "Test",
        email_address: `repeat-${Date.now()}-again@example.com`,
        passport_strategy,
        passport_id,
        passport_profile: { id: passport_id },
      }),
    ).rejects.toMatch(
      "recent attempt to make account with this passport strategy",
    );
  });
});
