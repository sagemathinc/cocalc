/*
A user's hourly spend rate is just the total cost_per_hour for all live metered purchases 
(so cost is null and cost_per_hour is set), e.g., this includes all of the pay-as-you-go 
project upgrades.

This does not count purchases that are one off hence not metered, e.g., gpt-4 usage.
*/

import getPool from "@cocalc/database/pool";

export default async function getSpendRate(
  account_id: string
): Promise<number> {
  const pool = getPool("medium"); // cached for a few seconds, since only changes when you upgrade a project, etc., which takes a bit.
  const { rows } = await pool.query(
    "SELECT SUM(cost_per_hour) as spend_rate FROM purchases WHERE cost IS NULL AND period_start IS NOT NULL AND period_end IS NULL AND account_id=$1",
    [account_id]
  );
  return rows[0]?.spend_rate ?? 0; // defaults to 0
}
