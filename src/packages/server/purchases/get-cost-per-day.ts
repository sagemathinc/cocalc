/*
Computes the total spend during each day (when something was spent)
by the given account, and return that amount.
*/

import getPool from "@cocalc/database/pool";

const DEFAULT_LIMIT = 100;

interface Options {
  account_id: string;
  limit?: number;
  offset?: number;
}

export default async function getCostPerDay({
  account_id,
  limit = 100,
  offset = 0,
}: Options): Promise<{ date: Date; total_cost: number }[]> {
  const db = getPool("long");
  const { rows } = await db.query(
    `SELECT date_trunc('day', "time" AT TIME ZONE 'UTC') AS date, SUM(COALESCE(cost, cost_per_hour * (EXTRACT(EPOCH FROM (COALESCE(period_end, NOW()) - period_start))::numeric / 3600))) AS total_cost
FROM purchases
WHERE account_id = $1 AND (cost > 0 OR cost_per_hour IS NOT NULL)
GROUP BY date_trunc('day', "time" AT TIME ZONE 'UTC')
ORDER BY date DESC LIMIT ${limit ?? DEFAULT_LIMIT} OFFSET ${offset ?? 0}`,
    [account_id]
  );
  return rows;
}
