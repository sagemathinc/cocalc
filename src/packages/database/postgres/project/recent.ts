/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { minutes_ago } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

export interface RecentProjectsOptions {
  age_m: number; // return results at most this old (in minutes)
  min_age_m?: number; // only returns results at least this old (in minutes)
  pluck?: string[]; // if not given, returns list of project_id's; if given, returns objects with these fields
}

export async function recentProjects(
  db: PostgreSQL,
  opts: RecentProjectsOptions,
): Promise<any> {
  const min_age_m = opts.min_age_m ?? 0;
  const columns = opts.pluck ? opts.pluck.join(",") : "project_id";

  const { rows } = await db.async_query({
    query: `SELECT ${columns} FROM projects`,
    where: {
      "last_edited >= $::TIMESTAMP": minutes_ago(opts.age_m),
      "last_edited <= $::TIMESTAMP": minutes_ago(min_age_m),
    },
  });

  if (!rows) {
    return [];
  }

  if (opts.pluck) {
    // Return array of objects with requested fields
    return rows;
  } else {
    // Return array of project_id strings
    return rows.map((row) => row.project_id);
  }
}
