/*
Transfer ownership of a compute server.

- If the server is deprovisioned this is always allowed.
- If the server is provisioned, not allowed... YET.
*/

import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function setServerOwner({
  id,
  account_id,
  new_account_id,
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id AS current_account_id, project_id, state FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error("invalid compute server id");
  }
  const { current_account_id, project_id, state } = rows[0];
  if (current_account_id == new_account_id) {
    // nothing to do -- already done.
    return;
  }
  if (current_account_id != account_id) {
    throw Error("only the owner of a compute server can transfer it");
  }
  if (state != "deprovisioned") {
    throw Error(
      "currently compute server must be deprovisioned before changing ownership",
    );
  }
  if (!(await isCollaborator({ project_id, account_id: new_account_id }))) {
    throw Error("cannot transfer ownership to non-collaborator on project");
  }
  await pool.query("UPDATE compute_servers SET account_id=$1 WHERE id=$2", [
    new_account_id,
    id,
  ]);
}
