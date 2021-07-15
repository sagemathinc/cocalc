/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { PostgreSQL } from "./types";

// Return an array of project_id's of projects that have the always_running run_quota set,
// but are not in the running or starting state.
// We only check for stable states, i.e. there is no state transition going on right now.
// Ref: smc-util/compute-states.js
// Performance: only an `x IN <array>` clause uses the index, not a `NOT IN`.
export async function projects_that_need_to_be_started(
  database: PostgreSQL,
  limit = 10
): Promise<string[]> {
  const result = await database.async_query({
    query: `SELECT project_id FROM projects WHERE (run_quota ->> 'always_running' = 'true') AND (state ->> 'state' IN ('archived', 'closed', 'opened') OR state IS NULL) LIMIT ${limit}`,
  });
  const projects: string[] = [];
  for (const row of result.rows) {
    projects.push(row.project_id);
  }
  return projects;
  // TODO: as mentioned above, need to also handle always_running coming from applied licenses,
  // which will be way more complicated.
}

export async function init_start_always_running_projects(
  database: PostgreSQL,
  interval_s: number = 15
): Promise<void> {
  while (true) {
    try {
      for (const project_id of await projects_that_need_to_be_started(
        database
      )) {
        const compute_server = (database as any).compute_server;
        if (compute_server == null) continue; // not initialized (?)
        const project = await compute_server(project_id);
        project.start(); // we fire this off, but do not wait on it
      }
    } catch (err) {
      console.warn("init_start_always_running_projects", err);
    }
    await delay(interval_s * 1000);
  }
}
