/*
This function ensures everything is in sync, and closes out compute server purchases 
periodically, similar to what is done in server/purchases/project-quotas for PAYG
project upgrades.
*/
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { closeAndContinuePurchase } from "@cocalc/server/compute/update-purchase";

const logger = getLogger("server:compute:maintain-purchases");

// Max time for a continuous compute server purchase.
const MAX_OPEN_PURCHASE_AGE = "1 day";

// never update ongoing purhase until at least this long after state change
// const MIN_STATE_CHANGED_WAIT_MS = 7 * 1000 * 60; // 7 minutes

export default async function maintainActivePurchases() {
  logger.debug("maintainActivePurchases");

  await closeAndContinueLongRunningPurchases();
  await syncPurchasingState();
}

/*
If the total amount of time is at least MAX_OPEN_PURCHASE_AGE, we close the purchase out
and make a new one starting now.  This is so a compute server can't just run
for months and *never* get billed for usage, and also, so usage is clearly displayed
on the statement each day.  Also, this shows users the total ongoing networking
charges every day.
*/
export async function closeAndContinueLongRunningPurchases() {
  logger.debug("closeLongRunningPurchases");
  // get all open compute server purchases that are at least one day old
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM purchases WHERE service='compute-server' AND period_end IS NULL AND period_start IS NOT NULL AND period_start <= NOW() - interval '${MAX_OPEN_PURCHASE_AGE}'`,
  );
  for (const { id } of rows) {
    await closeAndContinuePurchase(id);
  }
}

/*
- For all compute servers, it makes sure that the state of the purchases matches
  the state of the compute server.  E.g. if a compute server moves from running
  to off, then the 'running' purchase is supposed to end and a new 'off' purchase
  is supposed to start.   This should always happen, but just in case it doesn't
  happen for some reason (e.g., database connectivity issue?), we ensure it happens
  here.  To avoid interferring with proper functioning, we only consider state
  changes that are at least MIN_STATE_CHANGED_WAIT_MS old.
*/

export async function syncPurchasingState() {
  logger.debug(
    "syncPurchasingState: TODO -- this is not implemented yet (but it's only a double check in case of very rare potential bug situation)",
  );
}
