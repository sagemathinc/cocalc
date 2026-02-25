/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export interface AccountIsInOrganizationOpts {
  organization_id: string;
  account_id: string;
}

export async function accountIsInOrganization(
  db: PostgreSQL,
  opts: AccountIsInOrganizationOpts,
): Promise<boolean> {
  const result = await db.async_query({
    query: "SELECT COUNT(*) FROM organizations",
    cache: true,
    where: ["organization_id :: UUID = $1", "users ? $2"],
    params: [opts.organization_id, opts.account_id],
  });

  const count = parseInt(result?.rows?.[0]?.count ?? "0", 10);
  return count > 0;
}
