/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Get information about a project.
*/

import getPool from "@cocalc/database/pool";
import { isUUID } from "./util";

interface ProjectInfo {
  title: string;
  description: string;
  name: string;
  avatar_image_tiny: string;
  avatar_image_full: string;
}

export default async function getProjectInfo(
  project_id: string,
  columns: string[] = ["title", "description", "name"],
  // not cached by default since editing then reloading is confusing with this cached.
  cache?: "short" | "medium" | "long"
): Promise<Partial<ProjectInfo>> {
  const pool = getPool(cache);
  if (!isUUID(project_id)) {
    throw Error(`project_id ${project_id} must be a uuid`);
  }
  const project = await pool.query(
    `SELECT ${columns.join(",")} FROM projects WHERE project_id=$1`,
    [project_id]
  );
  if (project.rows.length == 0) {
    throw Error(`no project with id ${project_id}`);
  }
  const info: Partial<ProjectInfo> = {};
  for (const name of columns) {
    info[name] = project.rows[0][name] ?? "";
  }
  return info;
}
