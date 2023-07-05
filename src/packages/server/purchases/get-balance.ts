import getPool from "@cocalc/database/pool";

export default async function getBalance({
  account_id,
}: {
  account_id: string;
}): Promise<number> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT SUM(cost) as total_cost FROM purchases WHERE account_id=$1 AND paid IS NOT true",
    [account_id]
  );
  return rows[0].total_cost ?? 0;
}
