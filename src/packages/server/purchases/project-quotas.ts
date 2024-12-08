/*
Functions for working with project quotas.

TODO: Much of this code is general to ongoing pay-as-you-go purchases, but right
now only projects are such.  This code should get refactored into another file.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour as getPricePerHour0 } from "@cocalc/util/purchases/project-quotas";
import getPool, { PoolClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { cloneDeep } from "lodash";
import createPurchase from "./create-purchase";
import type { ProjectUpgrade as ProjectUpgradeDescription } from "@cocalc/util/db-schema/purchases";
import getBalance from "./get-balance";
import { getProject } from "@cocalc/server/projects/control";
import LRU from "lru-cache";
import { getPurchaseQuota } from "./purchase-quotas";
import { getTotalChargesThisMonth } from "./get-charges";
import { currency } from "@cocalc/util/misc";
import getMinBalance from "./get-min-balance";

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

// If there are any open pay as you go purchases for upgrading this project,
// close them, putting in the final price.  This always closes all open
// purchases, and does NOT check project state in any way.  This is called,
// e.g., right before making a pay as you go upgrade of the project, and
// also when the project changes state to not starting/running.
export async function closePayAsYouGoPurchases(project_id: string) {
  logger.debug("closePayAsYouGoPurchases", project_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, description, cost_per_hour FROM purchases WHERE service='project-upgrade' AND cost IS NULL AND project_id=$1",
    [project_id],
  );
  if (rows.length == 0) {
    logger.debug("closePayAsYouGoPurchases", project_id, " - no purchases");
    // no outstanding purchases for this project.
    return;
  }
  logger.debug(
    "closePayAsYouGoPurchases",
    project_id,
    ` - closing ${rows.length} purchases`,
  );
  for (const row of rows) {
    await closePurchase(row);
  }
}

async function closePurchase(opts: {
  id: number;
  cost_per_hour: number;
  description?: ProjectUpgradeDescription;
  now?: number;
  client?: PoolClient; // if given, this is used for the setting final cost and period_end below
}) {
  logger.debug("closePurchase", opts);
  const { id, now = Date.now(), client } = opts;
  let { cost_per_hour, description } = opts;

  const pool = getPool();
  if (description == null) {
    const { rows } = await pool.query(
      "SELECT description FROM purchases WHERE id=$1",
      [id],
    );
    if (rows.length == 0) {
      throw Error(`no purchase with id ${id}`);
    }
    description = rows[0]?.description;
    if (description == null) {
      throw Error(`purchase with id ${id} has no description`);
    }
  }
  // Figure out the final cost.
  if (cost_per_hour == null) {
    if (description.quota == null) {
      // invalid format: should never happen
      throw Error(
        `purchase with id ${id} has no description.quota but it must so we know the price`,
      );
    }
    // this should never happen, but we can try to recompute the cost.
    cost_per_hour = await getPricePerHour(description.quota);
  }
  let start = description.start;
  if (start == null) {
    logger.error("closePurchase: id=", id, " description.start was null");
    // should never happen, but if it did, let's make it one hour ago.
    start = now - 1000 * 60 * 60;
  }
  // record when project stopped
  description.stop = now;
  const cost = Math.max(
    0.01, // always at least one penny to avoid some abuse (?).
    ((now - start) / (1000 * 60 * 60)) * cost_per_hour,
  );
  // set the final cost, thus closing out this purchase.
  await (client ?? pool).query(
    "UPDATE purchases SET cost=$1, description=$2, period_end=$3 WHERE id=$4",
    [cost, description, new Date(now), id],
  );
}

// Also used externally when making statements.
export async function closeAndContinuePurchase(
  id: number,
  client?: PoolClient,
) {
  logger.debug("closeAndContinuePurchase", id);
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM purchases WHERE id=$1", [
    id,
  ]);
  const purchase = rows[0];
  if (purchase == null) {
    throw Error(`invalid purchase ${id}`);
  }
  const now = new Date();
  const newPurchase = cloneDeep(purchase);
  delete newPurchase.id;
  newPurchase.time = now;
  delete newPurchase.period_end;
  newPurchase.period_start = now;
  newPurchase.description.start = newPurchase.description.quota.start =
    now.valueOf();
  logger.debug(
    "closeAndContinuePurchase -- creating newPurchase=",
    newPurchase,
  );
  const new_purchase_id = await createPurchase(newPurchase);
  logger.debug(
    "closeAndContinuePurchase -- update purchased in run_quota of project",
  );
  await setRunQuotaPurchaseId(newPurchase.project_id, new_purchase_id);
  logger.debug("closeAndContinuePurchase -- closing old purchase", newPurchase);
  await closePurchase({
    id,
    cost_per_hour: purchase.cost_per_hour,
    description: purchase.description,
    now: now.valueOf(),
    client,
  });
}

async function setRunQuotaPurchaseId(project_id: string, purchase_id: number) {
  // In code below I could patch the JSONB object, but this rarely happens, so doesn't
  // have to be fast, and just reading and writing the entire run_quota object should
  // be reasonable robust.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT run_quota FROM projects WHERE project_id=$1",
    [project_id],
  );
  const { run_quota } = rows[0] ?? {};
  if (run_quota?.pay_as_you_go == null) {
    // nothing to do
    return;
  }
  run_quota.pay_as_you_go.purchase_id = purchase_id;
  await pool.query("UPDATE projects SET run_quota=$1 WHERE project_id=$2", [
    run_quota,
    project_id,
  ]);
}

const MAX_ELAPSED_MS = 1000 * 60 * 60 * 24; // 1 day

/*
This function ensures everything is in sync, and close out project purchases once per day.
In particular:

- If a project is not running/starting and there is an unclosed purchase, close it.
  This should always happend automatically by the state change close.  However, maybe
  it doesn't due to some weird issue, so this catches it.
- If there is a purchase of a project-upgrade that is actively being charged, make
  sure the project has the given run quota; otherwise end purchase.

- Also, if the total amount of time is at least 24 hours, we close the purchase out
  and make a new one starting now.  This is so an always running project can't just run
  for months and *never* get billed for usage, and also, so usage is clearly displayed
  in the user's balance.

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
    "SELECT purchases.account_id AS account_id, purchases.project_id AS project_id, purchases.id AS purchase_id, projects.run_quota->'pay_as_you_go'->>'purchase_id' AS run_quota_purchase_id, projects.state->>'state' AS state, purchases.description->'start' AS start, purchases.description->'quota'->>'cost' AS cost_per_hour FROM purchases, projects WHERE cost IS NULL AND service='project-upgrade' AND purchases.project_id = projects.project_id",
  );
  logger.debug(
    "maintainActivePurchases --- found",
    rows.length,
    "active purchases that might be closed",
  );
  for (const row of rows) {
    logger.debug("maintainActivePurchases -- considering", row);
    try {
      await doMaintenance(row);
    } catch (err) {
      console.trace(err);
      logger.debug(
        "maintainActivePurchases -- ERROR doing maintenance",
        err,
        row,
      );
    }
  }
}

async function doMaintenance({
  account_id,
  project_id,
  purchase_id,
  run_quota_purchase_id,
  state,
  start,
  cost_per_hour,
}) {
  const now = Date.now();
  if (
    !(
      (state == "running" || state == "starting") &&
      run_quota_purchase_id == purchase_id
    )
  ) {
    logger.debug("doMaintenance --- closing purchase with id", purchase_id);
    // It's no longer running and somehow stopping the project didn't trigger closing out
    // the purchase, or it was running pay-as-you-go for one user, then another user took over,
    // and the original purchase wasn't ended.
    try {
      await closePurchase({ id: purchase_id, cost_per_hour });
    } catch (err) {
      // I don't think this should ever happen but if it did that's bad.
      logger.error("Error closing a pay as you go purchase", err);
      // TODO -- send an email (?)
      throw err;
    }
  } else if (now - start >= MAX_ELAPSED_MS) {
    logger.debug(
      "doMaintenance --- closing AND continuing purchase with id",
      purchase_id,
    );
    await closeAndContinuePurchase(purchase_id);
  } else if (start != null && cost_per_hour != null) {
    // Check if spending limit has been exceeded and in that case, cut them off.
    const info = await getAccountInfo(account_id);
    const { balance, chargesThisMonth, limitThisMonth, minBalance } = info;
    logger.debug("doMaintenance --- spending info = ", info);
    let cutoff;
    if (balance <= minBalance) {
      // balance *includes* all partial metered charges already
      logger.debug(
        `doMaintenance --- stopping project because balance (${currency(
          balance,
        )} has hit the min allowed balance of = ${currency(minBalance)}`,
      );
      cutoff = true;
    } else if (chargesThisMonth >= limitThisMonth) {
      // this is the self-imposed limit to avoid accidental overspend
      logger.debug(
        "doMaintenance --- stopping project because chargesThisMonth + total_cost >= limitThisMonth",
      );
      cutoff = true;
      logger.debug("");
    } else {
      cutoff = false;
    }
    if (cutoff) {
      logger.debug(
        "doMaintenance --- cutoff true, so stopping project and pay-as-you-go project upgrade",
      );
      // cut this off -- (1) stop project, and (2) make sure purchase is closed
      const project = getProject(project_id);
      await project.stop();
      // project stop would probably trigger close, but just in case, we explicitly trigger it:
      await closePurchase({ id: purchase_id, cost_per_hour });
    }
  }
}

// cache for account balance quota, since the same user could
// get checked on a large number of times in one round of maintenance,
// and each query could be expensive.

interface AccountInfo {
  balance: number;
  limitThisMonth: number;
  chargesThisMonth: number;
  minBalance: number;
}

const accountCache = new LRU<string, AccountInfo>({
  ttl: 15000, // 15 seconds
  max: 1000,
});

async function getAccountInfo(account_id: string): Promise<AccountInfo> {
  if (accountCache.has(account_id)) {
    return accountCache.get(account_id)!;
  }
  const balance = await getBalance({ account_id });
  const limitThisMonth =
    (await getPurchaseQuota(account_id, "project-upgrade")) ?? 0;
  const chargesThisMonth = await getTotalChargesThisMonth(
    account_id,
    "project-upgrade",
  );
  const minBalance = await getMinBalance(account_id);
  const info = { balance, chargesThisMonth, limitThisMonth, minBalance };
  accountCache.set(account_id, info);
  return info;
}
