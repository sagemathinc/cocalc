/*
Get all unpaid and past_due subscriptions for the given account.

More precisely, gets array [{id:number;cost:number;status:'unpaid'|'past_due'}, ...]
*/

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const logger = getLogger("purchases:get-unpaid-subscriptions");

export default async function getUnpaidSubscriptions(
  account_id: string
): Promise<{ id: number; cost: number; status: "unpaid" | "past_due" }[]> {
  logger.debug("account_id = ", account_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, cost, status FROM subscriptions WHERE (status = 'unpaid' OR status = 'past_due') AND account_id=$1",
    [account_id]
  );
  return rows;
}
