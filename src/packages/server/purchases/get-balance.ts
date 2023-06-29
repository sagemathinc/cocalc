import getPool from "@cocalc/database/pool";
import { getLastClosingDate } from "./closing-date";

/*
compute the sum of the following, over all rows of the table for a given account_id:

- the cost if it is not null
- if the cost is null, I want to compute cost_per_hour times the number of 
  hours from period_start to period_end, or if period_end is null, the
  current time.
*/

export default async function getBalance(account_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT -SUM(COALESCE(cost, cost_per_hour * EXTRACT(EPOCH FROM (COALESCE(period_end, NOW()) - period_start)) / 3600)) as balance FROM purchases WHERE account_id=$1",
    [account_id]
  );
  return rows[0]?.balance ?? 0;
}

// [ ] TODO: we will make an actual statement table instead of this.
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
