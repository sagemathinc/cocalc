/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "./types";

// Return an array of project_id's of projects that have the always_running quota
// set (or a license that would provide it -- TODO!), but are not in the running
// or starting state.
export async function projects_that_need_to_be_started(
  database: PostgreSQL
): Promise<string[]> {
  const result = await database.async_query({
    query:
      "SELECT project_id FROM projects WHERE settings#>>'{always_running}' = '1' AND state#>>'{state}' NOT IN ('running', 'starting')",
  });
  const projects: string[] = [];
  for (const row of result.rows) {
    projects.push(row.project_id);
  }
  return projects;
  // TODO: as mentioned above, need to also handle always_running coming from applied licenses,
  // which will be way more complicated.
}
