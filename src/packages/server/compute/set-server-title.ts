import getPool from "@cocalc/database/pool";

export default async function setServerTitle({ account_id, id, title }) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET title=$1, last_edited=NOW() WHERE id=$2 AND account_id=$3",
    [title, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
}
