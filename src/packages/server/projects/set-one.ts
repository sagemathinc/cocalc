/* Updates an existing project's name, title, and/or description. May be
   restricted such that the query is executed as though by a specific account_id.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

import { DBProject } from "./get";

export default async function setProject({
  project_id,
  project_update,
  acting_account_id,
}: {
  project_id: string;
  project_update: Omit<DBProject, "project_id">;

  // If this parameter is NOT provided, the specified project will be updated
  // with NO authorization checks.
  //
  // If this parameter IS provided, this function will execute the project update query as
  // though the account id below had made the request; this has the effect of enforcing an
  // authorization check that the acting account is allowed to modify the desired project.
  //
  acting_account_id?: string;
}): Promise<DBProject | undefined> {
  // Filter out any provided fields which are null or undefined (but allow empty strings)
  // and convert parameter map to an ordered array.
  //
  const updateFields = Object.entries(project_update).filter(
    ([_, v]) => v ?? false,
  );

  if (!updateFields.length) {
    return;
  }

  // Create query param array and append project_id
  //
  const queryParams = updateFields.map(([k, v]) => v);
  queryParams.push(project_id);

  const updateSubQuery = updateFields
    .map(([k, v], i) => `${k}=$${i + 1}`)
    .join(",");

  let query = `UPDATE projects SET ${updateSubQuery} WHERE project_id=$${queryParams.length} AND deleted IS NOT TRUE`;

  // If acting_account_id is provided, we restrict the projects which may be updated
  // to those for which the corresponding account is listed as an owner.
  //
  if (acting_account_id) {
    if (!isValidUUID(acting_account_id)) {
      throw Error("acting_account_id must be a UUIDv4");
    }

    queryParams.push(acting_account_id);

    // TODO: Update this to execute only on owned projects.
    //
    query += ` AND users ? $${queryParams.length} AND (users#>>'{${acting_account_id},hide}')::BOOLEAN IS NOT TRUE`;
  }

  // Return updated fields
  //
  query += `RETURNING project_id, title, description, name`;

  // Execute query
  //
  const pool = getPool();
  const queryResult = await pool.query(query, queryParams);
  console.log(queryResult);
  const { rows } = queryResult;
  return rows?.[0];
}
