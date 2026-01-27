/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { pathToFiles } from "@cocalc/backend/files/path-to-files";
import getPool from "@cocalc/database/pool";

export async function pathFromID(
  id: string,
): Promise<{ projectPath: string; fsPath: string }> {
  // 'infinite' since actually result can't change since id determines the path (it's a reverse sha1 hash computation)
  const pool = getPool("infinite");
  const { rows } = await pool.query(
    "SELECT project_id, path FROM public_paths WHERE id=$1 AND disabled IS NOT TRUE",
    [id],
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
