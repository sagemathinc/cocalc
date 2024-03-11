/*
This function checks for any servers with long running purchases and
sets the update_purchase flag for them in the database, so that
the manage-purchases loop can handle them soon.

Here are the criterion for when we need to do some management of a compute server's purchases:

- it has any open purchase that started at least MAX_PURCHASE_LENGTH_MS ago.
- EVERYTHING active in the last day that isn't deprovisioned -- once every PERIODIC_SHORT_UPDATE_INTERVAL_MS
- also EVERYTHING that isn't deprovisioned -- once every PERIODIC_LONG_UPDATE_INTERVAL_MS
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import {
  MAX_PURCHASE_LENGTH_MS,
  PERIODIC_SHORT_UPDATE_INTERVAL_MS,
  PERIODIC_LONG_UPDATE_INTERVAL_MS,
} from "./manage-purchases";

const logger = getLogger("server:compute:maintain-purchases");

export default async function ongoingPurchases() {
  logger.debug("maintainActivePurchases");
  const pool = getPool();

  // be sure to update servers with open purchases past MAX_PURCHASE_LENGTH_MS
  await pool.query(`
  UPDATE compute_servers
  SET update_purchase=TRUE
  WHERE id IN (
    SELECT (description->>'compute_server_id')::integer
    FROM purchases
    WHERE cost IS NULL
    AND (service='compute-server' OR service='compute-server-network-usage')
    AND period_start <= NOW() - interval '${
      MAX_PURCHASE_LENGTH_MS / 1000
    } seconds'
  )
`);

  // update ALL non-deprovisioned servers that had some activity in the last day
  // that we haven't updated since PERIODIC_SHORT_UPDATE_INTERVAL_MS
  await pool.query(`
  UPDATE compute_servers
  SET update_purchase = TRUE
  WHERE state != 'deprovisioned' AND COALESCE(last_edited, '1970-01-01') >= now() - interval '1 day' AND COALESCE(last_purchase_update, '1970-01-01') <= NOW() - interval '${
    PERIODIC_SHORT_UPDATE_INTERVAL_MS / 1000
  } seconds'`);

  // update ALL non-deprovisioned servers
  // that we haven't updated since PERIODIC_LONG_UPDATE_INTERVAL_MS
  await pool.query(`
  UPDATE compute_servers
  SET update_purchase = TRUE
  WHERE state != 'deprovisioned' AND COALESCE(last_purchase_update, '1970-01-01') <= NOW() - interval '${
    PERIODIC_LONG_UPDATE_INTERVAL_MS / 1000
  } seconds'`);
}
