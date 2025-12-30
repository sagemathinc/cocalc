/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export interface GetProjectExtraEnvOptions {
  project_id: string;
}

export async function getProjectExtraEnv(
  db: PostgreSQL,
  opts: GetProjectExtraEnvOptions,
): Promise<any> {
  const { rows } = await db.async_query({
    query: "SELECT env FROM projects",
    where: { "project_id = $::UUID": opts.project_id },
  });

  if (!rows || rows.length === 0 || !rows[0].env) {
    // No env found - return empty object
    return {};
  }

  return rows[0].env;
}
