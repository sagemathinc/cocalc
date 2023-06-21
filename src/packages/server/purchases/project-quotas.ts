/*
Functions for working with project quotas.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour as getPricePerHour0 } from "@cocalc/util/purchases/project-quotas";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "async-await-utils/hof";

const logger = getLogger("purchases:project-quota");

export async function getMaxQuotas() {
  const { pay_as_you_go_max_project_upgrades } = await getServerSettings();
  return pay_as_you_go_max_project_upgrades;
}

export async function getPricePerHour(quota: ProjectQuota): Promise<number> {
  return getPricePerHour0(quota, await getPrices());
}

export async function getPrices() {
  const { pay_as_you_go_price_project_upgrades } = await getServerSettings();
  return pay_as_you_go_price_project_upgrades;
}

// If there are any open pay as you go purchases for this project,
// close them, putting in the final price.
export const closePayAsYouGoPurchases = reuseInFlight(
  closePayAsYouGoPurchases0
);
async function closePayAsYouGoPurchases0(project_id: string) {
  logger.debug("closePayAsYouGoPurchases0", project_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, description FROM purchases WHERE service='project-upgrade' AND cost IS NULL AND project_id=$1",
    [project_id]
  );
  if (rows.length == 0) {
    logger.debug("closePayAsYouGoPurchases0", project_id, " - no purchases");
    // no outstanding purchases for this project.
    return;
  }
  const { id, description } = rows[0];
  // there is an outstanding purchase.
  const { rows: rows1 } = await pool.query(
    "SELECT state->'state', run_quota->'pay_as_you_go'->>'purchase_id' as run_quota_purchase_id FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (rows1.length > 0) {
    const { state, run_quota_purchase_id } = rows1[0];
    if (
      (state == "running" || state == "starting") &&
      run_quota_purchase_id == id
    ) {
      logger.debug(
        "closePayAsYouGoPurchases0",
        project_id,
        " - running with run quota from this purchase, so don't close"
      );
      // don't close -- this makes it safe to call closePayAsYouGoPurchases
      // on running projects and have nothing happen
      return;
    }
  }
  await closePurchase(id, description);
}

async function closePurchase(id: string, description?) {
  const pool = getPool();
  if (description == null) {
    const { rows } = await pool.query(
      "SELECT description FROM purchases WHERE id=$1",
      [id]
    );
    if (rows.length == 0) {
      throw Error(`no purchase with id ${id}`);
    }
    description = rows[0]?.description;
    if (description == null) {
      throw Error(`purchase with id ${id} has no description`);
    }
  }
  if (description.quota == null) {
    // invalid format: should never happen
    throw Error(
      `purchase with id ${id} has no description.quota but it must so we know the price`
    );
  }

  // Figure out the final cost.
  let cost = description.quota.cost;
  if (cost == null) {
    // this should never happen, but we can just recompute the cost.
    cost = await getPricePerHour(description.quota);
  }
  let start = description.start;
  if (start == null) {
    logger.error("closePurchase: id=", id, " description.start was null");
    // should never happen, but if it did, let's make it one hour ago.
    start = Date.now() - 1000 * 60 * 60;
  }
  // record when project stopped
  description.stop = Date.now();
  const final_cost = Math.max(
    0.01, // always at least one penny to avoid some abuse (?).
    ((Date.now() - start) / (1000 * 60 * 60)) * cost
  );
  // set in the final cost, those closing out this purchase.
  await pool.query("UPDATE purchases SET cost=$1, description=$2 WHERE id=$3", [
    final_cost,
    description,
    id,
  ]);
}

/*
This function ensures everything is in sync, and close out project purchases once per day.  
In particular:

- If a project is not running/starting and there is an unclosed purchase, close it.
  This should always happened automatically by the state change close.  However, maybe
  it doesn't due to some weird issue, so this catches it.
- If there is a purchase of a project-upgrade that is actively being charged, make
  sure the project has the given run quota; otherwise end purchase.

Probably other issues will arise, but I can't think of any yet....
*/
export async function maintainActivePurchases() {
  logger.debug("maintainActivePurchases");

  /* 
  Query the database for the following:
    
    - purchase id
    - project_id
    - run_quota
    - state
    
  For all open project-upgrade purchases.
  */
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT purchases.id as purchase_id, projects.run_quota->'pay_as_you_go'->>'purchase_id' as run_quota_purchase_id, projects.state->>'state' as state FROM purchases, projects WHERE cost IS NULL AND service='project-upgrade' AND purchases.project_id = projects.project_id"
  );
  logger.debug(
    "maintainActivePurchases --- consider ",
    rows.length,
    " active purchases that might be closed"
  );
  for (const { purchase_id, run_quota_purchase_id, state } of rows) {
    if (
      !(
        (state == "running" || state == "starting") &&
        run_quota_purchase_id == purchase_id
      )
    ) {
      logger.debug(
        "maintainActivePurchases --- closing purchase with id",
        purchase_id
      );
      // It's no longer running and somehow stopping the project didn't trigger closing out
      // the purchase, or it was running pay-as-you-go for one user, then another user took over,
      // and the original purchase wasn't ended.
      try {
        await closePurchase(purchase_id);
      } catch (err) {
        // I don't think this should ever happen but if it did that's bad.
        logger.error("Error closing a pay as you go purchase", err);
        // [ ] TODO -- send an email (?)
      }
    }
  }
}
