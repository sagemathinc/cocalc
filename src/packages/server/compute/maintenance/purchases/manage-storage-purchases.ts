/*
For cloud file system purchases we have to do these things:

  - We periodically split long purchases so they don't exceed 1 day

  - Around 2 days (actually GOOGLE_COST_LAG_MS) after the purchase ends,
    we fill in the actual cost via computeBucketPurchaseCosts, which queries
    the BigQuery detailed billing export.

TODO: Later we will also fill in monitoring data to produce cost estimates
and potentially require extra funds to be available.
*/

import {
  GOOGLE_COST_LAG_MS,
  getBucketTotalCost,
  haveBigQueryBilling,
} from "@cocalc/server/compute/cloud/google-cloud/bigquery";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { closeAndContinueCloudStoragePurchase } from "./close";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { MAX_PURCHASE_LENGTH_MS } from "./manage-purchases";
import { createCloudStoragePurchase } from "@cocalc/server/compute/cloud-filesystem/create";
import { moneyToDbString, toDecimal } from "@cocalc/util/money";

const logger = getLogger(
  "server:compute:maintenance:purchases:manage-cloud-filesystem-purchase",
);

export default async function manageStoragePurchases() {
  logger.debug(
    "manageStoragePurchases: get all cloud storage purchases that could possibly need maintenance",
  );

  const toClose = await getPurchasesToClose();
  for (const purchase of toClose) {
    await closeAndContinueCloudStoragePurchase({ purchase });
  }
  const toComputeCost = await getPurchasesToComputeCost();
  await computeBucketPurchaseCosts(toComputeCost);

  await ensureCloudFilesystemsHavePurchases();
}

async function getPurchasesToClose(): Promise<Purchase[]> {
  const closeCutoff = new Date(Date.now() - MAX_PURCHASE_LENGTH_MS);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT *  FROM purchases WHERE service='compute-server-storage' AND cost IS NULL AND period_end IS NULL AND period_start <= $1",
    [closeCutoff],
  );
  return rows;
}

async function getPurchasesToComputeCost(): Promise<Purchase[]> {
  const computeCostCutoff = new Date(Date.now() - GOOGLE_COST_LAG_MS);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT *  FROM purchases WHERE service='compute-server-storage' AND cost IS NULL AND period_end IS NOT NULL AND period_end <= $1",
    [computeCostCutoff],
  );
  return rows;
}

// similar to computeNetworkPurchaseCosts in manage-purchases, but for buckets.
async function computeBucketPurchaseCosts(bucketPurchases) {
  const cutoff = Date.now() - GOOGLE_COST_LAG_MS;
  const purchases = bucketPurchases.filter(
    ({ period_end, cost }) =>
      period_end != null && cost == null && period_end.valueOf() <= cutoff,
  );
  if (purchases.length == 0) {
    logger.debug(
      "computeBucketPurchaseCosts: no purchases needing final cost computation",
    );
    return;
  }
  if (!(await haveBigQueryBilling())) {
    // give up
    logger.debug(
      "computeBucketPurchaseCosts: WARNING: we can never close out bucket purchases until BigQuery detailed billing export is configured.",
    );
    return;
  }
  for (const purchase of purchases) {
    logger.debug(
      "computeBucketPurchaseCosts: need to compute cost of bucket usage",
      purchase,
    );
    // NOTE: do NOT rely on the cloud_filesystems database entry for getting the
    // bucket name, because it could have long since been deleted.  Instead that
    // name must be stored in the purchase description and that's what we use here.
    const name = purchase.description.bucket;
    const end = new Date(purchase.period_end.valueOf() + 30000);
    let start = new Date(purchase.period_start.valueOf());
    start.setSeconds(0);
    start.setMinutes(0);
    start = new Date(start.valueOf() - 30000);
    const cost_breakdown = await getBucketTotalCost({ name, start, end });
    let costValue = toDecimal(0);
    for (const k in cost_breakdown) {
      costValue = costValue.add(cost_breakdown[k]);
    }
    purchase.cost = costValue.toNumber();
    purchase.description.cost = costValue.toNumber();
    purchase.description.cost_breakdown = cost_breakdown;
    const pool = getPool();
    await pool.query(
      "UPDATE purchases SET cost=$1, description=$2 WHERE id=$3",
      [moneyToDbString(costValue), purchase.description, purchase.id],
    );
  }
}

// Make sure every cloud file system that exists in the database
// has a corresponding active purchase associated to it.  There
// should be no way that this is ever necessary, but for safety
// and testing it is nice to do this, since not properly charging
// for a bucket could cost a huge amount, and if somehow there wasn't
// a purchase created, then there would never be a purchase without
// something like this (since new purchases get created normally only
// on bucket creation and when running purchases are closed continued).
export async function ensureCloudFilesystemsHavePurchases() {
  const pool = getPool();
  const { rows: missing } = await pool.query(
    "SELECT id, created, bucket, account_id, project_id FROM cloud_filesystems WHERE purchase_id IS NULL",
  );

  for (const {
    id: cloud_filesystem_id,
    created,
    bucket,
    account_id,
    project_id,
  } of missing) {
    const mostRecent = await getMostRecentPurchase(cloud_filesystem_id);
    logger.debug("ensureCloudFilesystemsHavePurchases: creating for missing", {
      cloud_filesystem_id,
    });
    await createCloudStoragePurchase({
      cloud_filesystem_id,
      account_id,
      project_id,
      bucket,
      period_start: mostRecent?.period_end ?? created,
    });
  }

  const { rows: notActive } = await pool.query(
    "SELECT cloud_filesystems.id AS cloud_filesystem_id, purchases.period_end AS period_end, cloud_filesystems.bucket AS bucket, cloud_filesystems.account_id AS account_id, cloud_filesystems.project_id AS project_id FROM cloud_filesystems,purchases WHERE cloud_filesystems.purchase_id=purchases.id AND purchases.period_end IS NOT NULL",
  );
  for (const {
    cloud_filesystem_id,
    period_end,
    bucket,
    account_id,
    project_id,
  } of notActive) {
    logger.debug(
      "ensureCloudFilesystemsHavePurchases: creating for notActive",
      { cloud_filesystem_id },
    );
    await createCloudStoragePurchase({
      cloud_filesystem_id,
      account_id,
      project_id,
      bucket,
      period_start: period_end,
    });
  }
}

async function getMostRecentPurchase(
  cloud_filesystem_id: number,
): Promise<undefined | Purchase> {
  const pool = getPool();
  // this is not an efficient query... but we will probably never ever use this in practice so it does not matter.
  const { rows } = await pool.query(
    "SELECT * FROM purchases WHERE service = 'compute-server-storage' AND (description->'cloud_filesystem_id')::integer = $1 ORDER BY time DESC LIMIT 1",
    [cloud_filesystem_id],
  );
  return rows[0];
}
