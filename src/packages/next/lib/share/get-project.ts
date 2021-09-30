/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Get information about a project.
*/

import getPool from "@cocalc/util-node/database";
import { isUUID } from "./util";

interface ProjectInfo {
  title: string;
  name: string;
}

export default async function getProjectInfo(
  project_id: string
): Promise<ProjectInfo> {
  const pool = getPool('medium');

  if (!isUUID(project_id)) {
    throw Error(`project_id ${project_id} must be a uuid`);
  }

  const project = await pool.query(
    "SELECT title, name FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (project.rows.length == 0) {
    throw Error(`no project with id ${project_id}`);
  }
  return {
    title: project.rows[0].title ?? "",
    name: project.rows[0].name ?? "",
  } as ProjectInfo;
}
