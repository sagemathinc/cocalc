/*
Undelete the compute server.
*/

import getPool from "@cocalc/database/pool";

export default async function undeleteServer({ account_id, id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, deleted FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error("no such compute server");
  }
  if (rows[0].account_id != account_id) {
    throw Error("you must be the owner of the compute server to delete it");
  }
  if (!rows[0].deleted) {
    // already not deleted
    return;
  }
  // do not just set deleted to null, since we want changefeed to update synctable
  // and it doesn't with deleted=null.
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET deleted=false WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to undelete compute server by a non-owner, which is not allowed.",
    );
  }
}
