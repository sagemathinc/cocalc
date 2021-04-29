/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Get the collaborators on a given project.  Unlisted collaborators are NOT included.
*/

import getPool from "./database";
import { User } from "./types";
import { isUUID } from "lib/util";

export default async function getCollaborators(
  project_id: string
): Promise<User[]> {
  if (!isUUID(project_id)) {
    throw Error("project_id must be a uuid");
  }
  const pool = getPool();
  const result = await pool.query(
    "SELECT accounts.account_id, accounts.first_name, accounts.last_name FROM accounts, (SELECT jsonb_object_keys(users) AS account_id FROM projects WHERE project_id=$1) AS users WHERE accounts.account_id=users.account_id::UUID AND accounts.unlisted IS NOT TRUE",
    [project_id]
  );
  return result.rows;
}
