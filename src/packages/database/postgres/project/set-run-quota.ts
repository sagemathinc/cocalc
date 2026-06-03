/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export async function setRunQuota(
  db: PostgreSQL,
  project_id: string,
  run_quota: Record<string, unknown>,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    jsonb_merge: { run_quota },
    where: { project_id },
  });
}
