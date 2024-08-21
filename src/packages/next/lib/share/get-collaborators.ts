/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Get the collaborators on a given project.  Unlisted collaborators are NOT included.
*/

import getPool from "@cocalc/database/pool";
import { isUUID } from "./util";
import { ProjectCollaborator } from "../api/schema/projects/collaborators/list";

export default async function getCollaborators(
  project_id: string,
  account_id?: string,
): Promise<ProjectCollaborator[]> {
  if (!isUUID(project_id)) {
    throw Error("project_id must be a uuid");
  }
  const pool = getPool("medium");
  let subQuery = `SELECT jsonb_object_keys(users) AS account_id FROM projects WHERE project_id=$1`;

  const queryParams = [project_id];

  if (account_id) {
    queryParams.push(account_id);
    subQuery += ` AND users ? $${queryParams.length}::TEXT`;
  }

  const result = await pool.query(
    `SELECT accounts.account_id, accounts.first_name, accounts.last_name FROM accounts, (${subQuery}) 
        AS users WHERE accounts.account_id=users.account_id::UUID 
                   AND accounts.unlisted IS NOT TRUE`,
    queryParams,
  );
  return result.rows;
}
