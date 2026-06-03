/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export interface SetProjectStatusOptions {
  project_id: string;
  status: any;
}

export async function setProjectStatus(
  db: PostgreSQL,
  opts: SetProjectStatusOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    set: { "status::JSONB": opts.status },
    where: { "project_id = $::UUID": opts.project_id },
  });
}
