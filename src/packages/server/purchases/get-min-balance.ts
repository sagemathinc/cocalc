import getPool from "@cocalc/database/pool";

export default async function getMinBalance(
  account_id: string
): Promise<number> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT min_balance FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return rows[0]?.min_balance ?? 0; // defaults to 0
}
