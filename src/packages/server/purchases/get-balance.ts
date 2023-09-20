import getPool from "@cocalc/database/pool";
import type { PoolClient } from "@cocalc/database/pool";

/*
compute the sum of the following, over all rows of the table for a given account_id:

- the cost if it is not null
- if the cost is null, I want to compute cost_per_hour times the number of
  hours from period_start to period_end, or if period_end is null, the
  current time.
*/

// selects the cost, or if not done, the metered cost so far (see above):
export const COST_OR_METERED_COST =
  "COALESCE(cost, cost_per_hour * EXTRACT(EPOCH FROM (COALESCE(period_end, NOW()) - period_start)) / 3600)";

export default async function getBalance(
  account_id: string,
  client?: PoolClient
): Promise<number> {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    `SELECT -SUM(${COST_OR_METERED_COST}) as balance FROM purchases WHERE account_id=$1 AND PENDING IS NOT true`,
    [account_id]
  );
  return rows[0]?.balance ?? 0;
}

// get sum of the *pending* transactions only for this user.
export async function getPendingBalance(
  account_id: string,
  client?: PoolClient
) {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    `SELECT -SUM(${COST_OR_METERED_COST}) as balance FROM purchases WHERE account_id=$1 AND PENDING=true`,
    [account_id]
  );
  return rows[0]?.balance ?? 0;
}

// total balance right now including all pending and non-pending transactions
export async function getTotalBalance(account_id: string, client?: PoolClient) {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    `SELECT -SUM(${COST_OR_METERED_COST}) as balance FROM purchases WHERE account_id=$1`,
    [account_id]
  );
  return rows[0]?.balance ?? 0;
}
