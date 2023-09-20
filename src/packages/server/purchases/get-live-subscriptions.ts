/*
Get limited info about all unpaid, past_due and active subscriptions for the given account.

This is used mainly for informing user about unpaid subscriptions, but we include active as
well to provide a better overall view.

More precisely, gets array [{id:number;cost:number;status:'unpaid'|'past_due'|'active'}, ...]
*/

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const logger = getLogger("purchases:get-unpaid-subscriptions");

export default async function getLiveSubscriptions(
  account_id: string
): Promise<
  { id: number; cost: number; status: "unpaid" | "past_due" | "active" }[]
> {
  logger.debug("account_id = ", account_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, cost, status FROM subscriptions WHERE (status = 'unpaid' OR status = 'past_due' OR status = 'active') AND account_id=$1",
    [account_id]
  );
  return rows;
}
