/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

describe("nameToAccountOrOrganization", () => {
  const database: PostgreSQL = db();

  async function nameToAccountOrOrganization(
    name: string,
  ): Promise<string | undefined> {
    return database.nameToAccountOrOrganization(name);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("returns the account_id for account names (case-insensitive)", async () => {
    const pool = getPool();
    const accountId = uuid();
    const accountName = `acct-${uuid().slice(0, 8)}`;

    await pool.query(
      "INSERT INTO accounts (account_id, email_address, created, name) VALUES ($1, $2, NOW(), $3)",
      [accountId, `${accountName}@example.com`, accountName],
    );

    const result = await nameToAccountOrOrganization(accountName.toUpperCase());

    expect(result).toBe(accountId);
  });

  it("returns the organization_id for organization names", async () => {
    const pool = getPool();
    const organizationId = uuid();
    const organizationName = `org-${uuid().slice(0, 8)}`;

    await pool.query(
      "INSERT INTO organizations (organization_id, created, name) VALUES ($1, NOW(), $2)",
      [organizationId, organizationName],
    );

    const result = await nameToAccountOrOrganization(
      organizationName.toUpperCase(),
    );

    expect(result).toBe(organizationId);
  });

  it("returns undefined when the name is unused", async () => {
    const result = await nameToAccountOrOrganization(
      `unused-${uuid().slice(0, 8)}`,
    );

    expect(result).toBeUndefined();
  });
});
