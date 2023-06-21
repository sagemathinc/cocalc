/*
Functions for working with project quotas.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour as getPricePerHour0 } from "@cocalc/util/purchases/project-quotas";
import getPool from "@cocalc/database/pool";

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
export async function closePayAsYouGoPurchases(project_id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, description FROM purchases WHERE service='project-upgrade' AND cost IS NULL AND project_id=$1",
    [project_id]
  );
  if (rows.length == 0) {
    // no outstanding purchases for this project.  This should usually be the case.
    return;
  }
  const { id, description } = rows[0];
  // there is an outstanding purchase.
  const { rows: rows1 } = await pool.query(
    "SELECT state FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (rows1.length == 0) {
    // no such project
    return;
  }
  const state = rows1[0]?.state?.state;
  if (state == "running" || state == "starting") {
    // don't close -- this makes it safe to call closePayAsYouGoPurchases on running projects and have nothing happen
    return;
  }

  if (description.quota == null) {
    // invalid format: should never happen
    return;
  }

  // Figure out the final cost.
  let cost = description.quota.cost;
  if (cost == null) {
    // this should never happen, but we can just recompute the cost.
    cost = await getPricePerHour(description.quota);
  }
  let start = description.start;
  if (start == null) {
    // should never happen, but if it did, let's just make it an hour ago.
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
