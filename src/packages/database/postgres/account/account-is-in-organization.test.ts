/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

describe("accountIsInOrganization", () => {
  const database: PostgreSQL = db();

  async function accountIsInOrganization(opts: {
    organization_id: string;
    account_id: string;
  }): Promise<boolean> {
    return database.accountIsInOrganization(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("returns true for a member", async () => {
    const pool = getPool();
    const organizationId = uuid();
    const accountId = uuid();
    const name = `org-${uuid().slice(0, 8)}`;

    await pool.query(
      "INSERT INTO organizations (organization_id, created, name, users) VALUES ($1, NOW(), $2, $3)",
      [organizationId, name, JSON.stringify({ [accountId]: "member" })],
    );

    const result = await accountIsInOrganization({
      organization_id: organizationId,
      account_id: accountId,
    });

    expect(result).toBe(true);
  });

  it("returns true for an owner", async () => {
    const pool = getPool();
    const organizationId = uuid();
    const accountId = uuid();
    const name = `org-${uuid().slice(0, 8)}`;

    await pool.query(
      "INSERT INTO organizations (organization_id, created, name, users) VALUES ($1, NOW(), $2, $3)",
      [organizationId, name, JSON.stringify({ [accountId]: "owner" })],
    );

    const result = await accountIsInOrganization({
      organization_id: organizationId,
      account_id: accountId,
    });

    expect(result).toBe(true);
  });

  it("returns false for non-members and missing organizations", async () => {
    const pool = getPool();
    const organizationId = uuid();
    const accountId = uuid();
    const otherAccountId = uuid();
    const name = `org-${uuid().slice(0, 8)}`;

    await pool.query(
      "INSERT INTO organizations (organization_id, created, name, users) VALUES ($1, NOW(), $2, $3)",
      [organizationId, name, JSON.stringify({ [accountId]: "member" })],
    );

    const nonMember = await accountIsInOrganization({
      organization_id: organizationId,
      account_id: otherAccountId,
    });
    expect(nonMember).toBe(false);

    const missingOrg = await accountIsInOrganization({
      organization_id: uuid(),
      account_id: accountId,
    });
    expect(missingOrg).toBe(false);
  });
});
