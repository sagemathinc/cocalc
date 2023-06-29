import getPool from "@cocalc/database/pool";
import { getLastClosingDate } from "./closing-date";

export default async function getBalance(account_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT -SUM(cost) as balance FROM purchases WHERE account_id=$1",
    [account_id]
  );
  return rows[0]?.balance ?? 0;
}

export async function getLastStatementBalance(
  account_id: string
): Promise<number> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  const { rows } = await pool.query(
    "SELECT -SUM(cost) as total FROM purchases WHERE account_id=$1 AND time<=$2",
    [account_id, closing_date]
  );
  return rows[0].total ?? 0;
}
