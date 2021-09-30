/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import getPool from "@cocalc/util-node/database";
import { projects } from "@cocalc/util-node/data";

// Given a project_id/path, return the directory on the file system where
// that path should be located.
export default function pathToFiles(project_id: string, path: string): string {
  return join(projects.replace("[project_id]", project_id), path);
}

export async function pathFromID(
  id: string
): Promise<{ projectPath: string; fsPath: string }> {
  // 'infinite' since actually result can't change since id determines the path (it's a reverse sha1 hash computation)
  const pool = getPool("infinite");
  const { rows } = await pool.query(
    "SELECT project_id, path FROM public_paths WHERE id=$1 AND disabled IS NOT TRUE",
    [id]
  );
  if (rows.length == 0) {
    throw Error(`no such public path: ${id}`);
  }

  const { project_id, path } = rows[0];
  if (project_id == null || path == null) {
    throw Error(`invalid public path: ${id}`);
  }
  return { projectPath: path, fsPath: pathToFiles(project_id, path) };
}
