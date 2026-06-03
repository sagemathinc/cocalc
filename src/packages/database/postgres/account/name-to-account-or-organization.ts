/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export async function nameToAccountOrOrganization(
  db: PostgreSQL,
  name: string,
): Promise<string | undefined> {
  const loweredName = name.toLowerCase();
  const accountResult = await db.async_query<{ account_id: string }>({
    query: "SELECT account_id FROM accounts",
    cache: false,
    where: ["LOWER(name) = $1"],
    params: [loweredName],
  });

  if (accountResult.rows.length > 0) {
    return accountResult.rows[0].account_id;
  }

  const organizationResult = await db.async_query<{
    organization_id: string;
  }>({
    query: "SELECT organization_id FROM organizations",
    cache: false,
    where: ["LOWER(name) = $1"],
    params: [loweredName],
  });

  if (organizationResult.rows.length > 0) {
    return organizationResult.rows[0].organization_id;
  }

  return undefined;
}
