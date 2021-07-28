/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Get the public paths associated to a given project.  Unlisted paths are NOT included.
*/

import getPool from "lib/database";
import { PublicPath } from "lib/types";
import { isUUID } from "lib/util";

export default async function getPublicPaths(
  project_id: string
): Promise<PublicPath[]> {
  if (!isUUID(project_id)) {
    throw Error("project_id must be a uuid");
  }
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, path, description, EXTRACT(EPOCH FROM last_edited)*1000 as last_edited FROM public_paths WHERE disabled IS NOT TRUE AND unlisted IS NOT TRUE AND project_id=$1 ORDER BY counter DESC",
    [project_id]
  );
  return result.rows;
}
