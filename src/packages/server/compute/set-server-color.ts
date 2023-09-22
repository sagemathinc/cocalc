import getPool from "@cocalc/database/pool";

export default async function setServerColor({ account_id, id, color }) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET color=$1 WHERE id=$2 AND account_id=$3",
    [color, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
}
