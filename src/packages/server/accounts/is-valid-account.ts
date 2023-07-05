import getPool from "@cocalc/database/pool";

export default async function isValidAccount(account_id: string): Promise<boolean> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT COUNT(*) as count FROM accounts WHERE account_id = $1::UUID",
    [account_id]
  );
  return rows[0].count > 0;
}
