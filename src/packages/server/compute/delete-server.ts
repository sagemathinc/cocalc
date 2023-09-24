/*
Delete the compute server. You can only do this if the VM is
in the deleted state.
*/

import getPool from "@cocalc/database/pool";

export default async function deleteServer({ account_id, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, state FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error("no such compute server");
  }
  if (rows[0].account_id != account_id) {
    throw Error("you must be the owner of the compute server to delete it");
  }
  if (rows[0].state != "deleted") {
    throw Error(
      "the compute server VM must be deleted before deleting the compute server",
    );
  }
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET deleted=true WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to delete compute server by a non-owner, which is not allowed.",
    );
  }
}
