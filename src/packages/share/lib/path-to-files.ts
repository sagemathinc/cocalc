/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join, resolve } from "path";
import { getPool } from "./database";
import { projects } from "smc-util-node/data";


// Given a project_id/path, return the directory on the file system where
// that path should be located.
export default function pathToFiles(project_id: string, path: string): string {
  return join(projects, project_id, path);
}

export async function pathFromID(id: string): Promise<string> {
  // TODO: [ ] check that id is of a public_path that is enabled
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT project_id, path FROM public_paths WHERE id=$1",
    [id]
  );
  if (rows.length == 0) {
    throw Error(`no such public path: ${id}`);
  }

  return pathToFiles(rows[0].project_id, rows[0].path);
}
