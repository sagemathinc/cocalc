/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Get information about a project.
*/

import getPool from "lib/database";
import { isUUID } from "lib/util";

export async function getProjectTitle(
  project_id: string
): Promise<string | undefined> {
  const pool = getPool();

  if (!isUUID(project_id)) {
    throw Error(`project_id ${project_id} must be a uuid`);
  }

  const project = await pool.query(
    "SELECT title FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (project.rows.length == 0) {
    throw Error(`no project with id ${project_id}`);
  }
  return project.rows[0]?.title;
}
