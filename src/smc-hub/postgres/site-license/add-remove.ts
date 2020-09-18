/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../types";
import { query } from "../query";

// data = jsonb_set(data, '{a}', '5'::jsonb);
export async function add_license_to_project(
  db: PostgreSQL,
  project_id: string,
  license_id: string
): Promise<void> {
  return await query({
    db,
    query: "UPDATE projects",
    where: { project_id },
    jsonb_merge: { site_license: { [license_id]: {} } },
  });
}

export async function remove_license_from_project(
  db: PostgreSQL,
  project_id: string,
  license_id: string
): Promise<void> {
  return await query({
    db,
    query:
      "UPDATE projects SET site_license=site_license-$1 WHERE project_id=$2",
    params: [license_id, project_id],
  });
}
