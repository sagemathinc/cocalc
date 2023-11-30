/*
Code related to closing active purchases.
*/
import getPool, {
  getTransactionClient,
  PoolClient,
} from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import { cloneDeep } from "lodash";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { MIN_NETWORK_CLOSE_DELAY_MS } from "./manage-purchases";
import { setPurchaseId } from "./util";
import { computeCost, getNetworkUsage } from "@cocalc/server/compute/control";

const logger = getLogger("server:compute:maintenance:purchases:close");

// Code below is similar to code in server/purchases/project-quotas.ts.
// NOTE: the purchase is mutated to reflect change to db.
export async function closePurchase({
  purchase,
  client,
}: {
  purchase: Purchase;
  client?: PoolClient;
}) {
  logger.debug("closePurchase", purchase.id);
  if (purchase.description?.type != "compute-server") {
    logger.debug("closePurchase: WARNING -- wrong kind of purchase");
    return;
  }
  const pool = client ?? getPool();
  if (purchase.period_end || purchase.cost) {
    // do not close purchase more than once:
    logger.debug("closePurchase -- already closed");
    return;
  }
  if (!purchase.period_start) {
    // should be impossible.
    logger.debug(
      "closePurchase -- BUG -- period_start not set -- should be impossible",
      purchase,
    );
    return;
  }

  if (!purchase.cost_per_hour) {
    // should be impossible.
    logger.debug(
      "closePurchase -- BUG -- cost_per_hour not set -- should be impossible",
      purchase,
    );
    return;
  }

  // Figure out the final cost.
  const start = purchase.period_start.valueOf();
  const now = Date.now();
  // at least 1 minute
  const hours = Math.max((now - start) / (1000 * 60 * 60), 1 / 60.0);
  purchase.cost = Math.max(
    0.001, // always at least 0.1 penny to avoid abuse (?).
    hours * purchase.cost_per_hour,
  );
  // set the final cost, thus closing out this purchase.
  purchase.period_end = new Date(now);
  await pool.query("UPDATE purchases SET cost=$1, period_end=$2 WHERE id=$3", [
    purchase.cost,
    purchase.period_end,
    purchase.id,
  ]);
}

export async function closeAndContinuePurchase({
  purchase,
  server,
}: {
  purchase: Purchase;
  server: ComputeServer;
}): Promise<undefined | number> {
  logger.debug("closeAndContinuePurchase", purchase);
  if (purchase.cost != null || purchase.period_end != null) {
    logger.debug(
      "closeAndContinuePurchase: WARNING -- can't close and continue purchase because it is already closed",
    );
    return;
  }
  if (purchase.description?.type != "compute-server") {
    logger.debug("closeAndContinuePurchase: WARNING -- wrong kind of purchase");
    return;
  }

  const now = new Date();
  const newPurchase = cloneDeep(purchase);
  newPurchase.time = now;
  newPurchase.period_start = now;

  // It's possible the cloud server rates changed, so we recompute the cost
  // in order to take that into account.
  const cost_per_hour = await computeCost({
    server,
    state: server.state ?? "deprovisioned",
  });
  newPurchase.cost_per_hour = cost_per_hour;

  logger.debug(
    "closeAndContinuePurchase -- creating newPurchase=",
    newPurchase,
    "as a single atomic transaction",
  );

  // Very important to do this as atomic transaction so we
  // don't end up with two simultaneous purchases, or purchase_id
  // wrong in the compute server record!

  const client = await getTransactionClient();
  try {
    logger.debug("closeAndContinuePurchase -- creating new purchase");
    const new_purchase_id = await createPurchase({ ...newPurchase, client });
    logger.debug(
      "closeAndContinuePurchase -- update purchased in run_quota of project",
    );
    await setPurchaseId({
      purchase_id: new_purchase_id,
      server_id: server.id,
      cost_per_hour: purchase.cost_per_hour ?? 0, // should always be set
      client,
    });
    logger.debug("closeAndContinuePurchase -- closing old purchase");
    await closePurchase({
      purchase,
      client,
    });
    await client.query("COMMIT");
    return new_purchase_id;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.debug("closeAndContinuePurchase -- ERROR, rolling back", err);
    delete purchase.period_end;
    delete purchase.cost;
  } finally {
    client.release();
  }
}

// Close the given network purchase, then create a new one
// if the compue server is currently running.  If not, don't
// create new one.  Close and create are done together as a single
// transaction.
export async function closeAndPossiblyContinueNetworkPurchase({
  purchase,
  server,
}: {
  purchase: Purchase;
  server: ComputeServer;
}): Promise<undefined | number> {
  logger.debug("closeAndContinueNetworkPurchase", purchase);
  if (purchase.description?.type != "compute-server-network-usage") {
    logger.debug(
      "closeAndContinueNetworkPurchase: WARNING -- wrong kind of purchase",
    );
    return;
  }
  if (purchase.cost != null || purchase.period_end != null) {
    logger.debug(
      "closeAndContinueNetworkPurchase: WARNING -- can't close and continue purchase because it is already closed",
    );
    return;
  }
  if (!purchase.period_start) {
    // should be impossible.
    logger.debug(
      "closeAndContinueNetworkPurchase -- BUG -- period_start not set -- should be impossible",
      purchase,
    );
    return;
  }

  // go slightly back in time so that the network usage data is likely
  // to be all there by now, hopefully (any that isn't we are just giving
  // away for free).
  const end = new Date(Date.now() - 2 * MIN_NETWORK_CLOSE_DELAY_MS);
  const newPurchase = cloneDeep(purchase);
  if (newPurchase.description.type != "compute-server-network-usage") {
    throw Error("bug");
  }
  newPurchase.time = end;
  newPurchase.period_start = end;
  newPurchase.cost_so_far = 0;
  newPurchase.description.amount = 0;
  newPurchase.description.last_updated = end.valueOf();
  const network = await getNetworkUsage({
    server,
    start: purchase.period_start,
    end,
  });
  const prev_cost_so_far = purchase.cost_so_far;
  const prevDescription = { ...purchase.description };
  if (purchase.description.type != "compute-server-network-usage") {
    logger.debug(
      "closeAndContinueNetworkPurchase: WARNING -- wrong kind of purchase",
    );
    return;
  }
  purchase.description.amount = network.amount;
  purchase.cost_so_far = network.cost;
  purchase.description.last_updated = end.valueOf();

  logger.debug(
    "closeAndContinueNetworkPurchase -- creating newPurchase=",
    newPurchase,
    "as a single atomic transaction",
  );

  // Very important to do this as atomic transaction so we
  // don't end up with two simultaneous purchases, or purchase_id
  // wrong in the compute server record!

  const client = await getTransactionClient();
  try {
    logger.debug(
      "closeAndContinueNetworkPurchase -- creating new purchase",
      newPurchase,
    );
    // create new purchase, but only if server is running right now
    let purchase_id;
    if (server.state == "running") {
      purchase_id = await createPurchase({ ...newPurchase, client });
    } else {
      purchase_id = undefined;
    }
    // close existing purchase;
    logger.debug("closeAndContinueNetworkPurchase -- closing old purchase");
    purchase.cost = Math.max(0.001, network.cost);
    purchase.period_end = end;
    await client.query(
      "UPDATE purchases SET cost=$1, period_end=$2, cost_so_far=$3 WHERE id=$4",
      [purchase.cost, purchase.period_end, purchase.cost_so_far, purchase.id],
    );
    await client.query("COMMIT");
    return purchase_id;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.debug("closeAndContinueNetworkPurchase -- ERROR, rolling back", err);
    delete purchase.period_end;
    delete purchase.cost;
    purchase.cost_so_far = prev_cost_so_far;
    purchase.description = prevDescription;
  } finally {
    client.release();
  }
}
