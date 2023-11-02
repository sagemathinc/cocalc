/*
The function managePurchases that is exported from this file should be
called periodically and frequently from a *single* hub server. It
queries the database for compute servers with activity that warrants
possibly updating their purchases, then does that work.
*/

import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { computeCost, getNetworkUsage, stop } from "../control";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { cloneDeep } from "lodash";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
const logger = getLogger("server:compute:maintenance/manage-purchases");

const MIN_NETWORK_CLOSE_DELAY_MS = 2 * 60 * 1000;

// a single purchase is split once it exceeds this length:
export const MAX_PURCHASE_LENGTH_MS = 1000 * 60 * 60 * 24; // 1 day

// network purchasing info is updated this frequently for running servers
export const MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS = 1000 * 60 * 30; // 30 minutes

//every provisioned server gets purchases updated at least this often
export const PERIODIC_UPDATE_INTERVAL_MS = 1000 * 60 * 60 ; // 1 hour

// turn VM off if you don't have at least this much extra:
const COST_THRESH_DOLLARS = 2.5;

export default async function managePurchases() {
  logger.debug("managePurchases");
  // Use a transaction so we get all the compute_servers in need of update
  // then mark them as not in need of update atomically, so if anything new
  // is marked as in need of update, that won't be missed or unintentionally
  // canceled. Also, this means we don't have to write back all the ids in
  // the query.
  const client = await getTransactionClient();
  let servers: ComputeServer[] = [];
  try {
    const { rows } = await client.query(
      "SELECT * FROM compute_servers WHERE update_purchase=TRUE",
    );
    // We mark them as updated here even if something goes wrong below, since we
    // don't want to constantly re-attempt and what can we do??
    servers = rows;
    await client.query(
      "UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()  WHERE update_purchase=TRUE",
    );
    await client.query("COMMIT");
  } catch (err) {
    logger.debug("error -- ", err, " so rolling back transaction");
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  // for now just do them in serial, but could make this more parallel later.
  logger.debug(
    "managePurchases: handling ",
    servers.length,
    " servers whose purchase may need work",
  );
  for (const row of servers) {
    try {
      await updatePurchase(row);
    } catch (err) {
      logger.debug("managePurchases: error updating purchases", {
        err,
        server: row,
      });
    }
  }
}

// get all outstanding current purchases involving this compute server
async function outstandingPurchases(
  server: ComputeServer,
): Promise<Purchase[]> {
  const pool = getPool();
  // project_id part of this query is not required, but should make it faster:
  const { rows } = await pool.query(
    "SELECT * FROM purchases WHERE cost IS NULL and (service='compute-server' OR service='compute-server-network-usage') AND project_id=$1 AND description->>'compute_server_id'=$2",
    [server.project_id, `${server.id}`],
  );
  return rows;
}

async function updatePurchase(server: ComputeServer) {
  logger.debug("updatePurchase", { id: server.id, title: server.title });
  const allPurchases = await outstandingPurchases(server);
  const purchases = allPurchases.filter((x) => x.service == "compute-server");
  const networkPurchases = allPurchases.filter(
    (x) => x.service == "compute-server-network-usage",
  );

  logger.debug("updatePurchase: outstanding purchases", { purchases, server });

  /*
  We have all outstanding purchase info and server info. With that we should know
  exactly what to do.  NOTE: I'm not outlining anything here relateed to the database
  being corrupt due to race conditions or whatever, since I've setup the code
  so there shouldn't be any race conditions.

  NOTES:
  - Google charges us from when a server starts starting until it is stopped, i.e., for
    the startup time and shutdown time.  There's probably some very good reasons for that,
    e.g., some bigger servers can take minutes to start... but also if a user starts and
    stops immediately a bunch of machines, they can't cause a lot of charges.   We don't really do the same...
  - Google has a minimum of 1 minute.  We will for the same reasons.

  RULES:

  - RULE 1: If there are no compute-server purchases and the machine is currently not in
    the deprovisioned state, we start a compute-server purchase:
      - if state is stable, make it for that state
      - if state is unstable, make purchase for the target stable state

  - RULE 2: If there are no 'compute-server-network-usage' purchases and machine is
    running or starting, create such a purchase.

  - RULE 3: If there is a compute-server purchase and machine is in a stable state that is different
    from the purchase one (e.g., running vs off), end the current purchase.  If not deprovisioned,
    do a recursive call to create new purchase for new state.

  - RULE 4: If there is an ongoing 'compute-server-network-usage' purchase, possibly update it.
    If project is not running and it has been at least X minutes after stopping/deleting,
    update and close the purchase.  The issue here is just that network usage takes a few minutes to
    get recorded.

  - RULE 5: If the total duration of a purchase exceeds MAX_PURCHASE_INTERVAL_MS
    (e.g., 1 day), then we end that purchase and start another.

  - RULE 6: Balance actions -- **PARTIALLY IMPLEMENTED ONLY**
       - If balance is low, email user suggesting they add credit to their account
         or enable automatic billing.
       - If balance is lower, use automatic billing if possible.  If not, stop any
         running compute servers.
       - If balance drops too low, deprovision everything.
  */

  if (!server.state) {
    logger.debug(
      "WARNING: server.state should be defined but isn't",
      server.id,
    );
    // nothing is possible
    return;
  }

  const stableState = STATE_INFO[server.state].stable
    ? server.state
    : STATE_INFO[server.state].target;
  if (!stableState) {
    // nothing is possible
    logger.debug("WARNING: stableState should be defined but isn't", server.id);
    return;
  }

  // Rule 1: creating compute-server purchase
  if (purchases.length == 0 && server.state != "deprovisioned") {
    const cost_per_hour = await computeCost({ server, state: stableState });

    if (!cost_per_hour) {
      // no need to make a new purchase, e.g., deprovisioned is free.
      await setPurchaseId({
        purchase_id: null,
        server_id: server.id,
        cost_per_hour,
      });
    } else {
      logger.debug(
        `start new pay-as-you-go purchase for ${cost_per_hour}/hour`,
      );
      const purchase_id = await createPurchase({
        client: null,
        account_id: server.account_id,
        project_id: server.project_id,
        service: "compute-server",
        period_start: new Date(),
        cost_per_hour,
        description: {
          type: "compute-server",
          state: stableState,
          compute_server_id: server.id,
          configuration: server.configuration,
        },
      });
      await setPurchaseId({ purchase_id, server_id: server.id, cost_per_hour });
    }
  }

  // Rule 2: creating compute-server-network-usage purchase
  if (
    networkPurchases.length == 0 &&
    server.state == "running" &&
    server.cloud == "google-cloud" // NOTE: only google cloud has network purchases right now.
  ) {
    await createPurchase({
      client: null,
      account_id: server.account_id,
      project_id: server.project_id,
      service: "compute-server-network-usage",
      cost_per_hour: 0, // used in balance computation.
      period_start: new Date(),
      description: {
        type: "compute-server-network-usage",
        compute_server_id: server.id,
        amount: 0,
        cost: 0,
        last_updated: Date.now(),
      },
    });
  }

  // Rule 3: End current purchase?
  if (server.state == stableState && purchases.length > 0) {
    if (purchases.length > 1) {
      // this should be impossible
      logger.debug(
        `ERROR/BUG -- there are multiple purchases for the same compute server!`,
        purchases,
      );
    }
    // just deal with all of them
    let count = 0;
    for (const purchase of purchases) {
      if (
        purchase.description.type == "compute-server" &&
        server.state != purchase.description?.state
      ) {
        // state changed, so end the purchase
        await closePurchase({ purchase });
        count += 1;
      }
    }
    if (count == purchases.length && stableState != "deprovisioned") {
      // everything was closed, but target stable state does cost money,
      // so pay attention to this server very soon to make a new purchase.
      await updatePurchaseSoon(server.id);
    }
  }

  // Rule 4: End any networking purchases that we should end, and also
  // update the total amount of network usage periodically, so user
  // can see it.  (This is only for google cloud)
  if (networkPurchases.length > 0) {
    if (
      server.state != "running" &&
      stableState != "running" &&
      server.state_changed &&
      Date.now() - server.state_changed.valueOf() >= MIN_NETWORK_CLOSE_DELAY_MS
    ) {
      // It's not running and it's not about to be running, and the last
      // state change was at least a little bit in th past.  In this case
      // there can be no network activity, so we end all the network
      // purchases (that aren't very recent).
      for (const purchase of networkPurchases) {
        // only take purchases that started at least MIN_NETWORK_CLOSE_DELAY_MS ago,
        // since a new one could have started and we don't want to end that.
        if (
          purchase.period_start &&
          purchase.description.type == "compute-server-network-usage" &&
          Date.now() - purchase.period_start.valueOf() >
            MIN_NETWORK_CLOSE_DELAY_MS
        ) {
          const end = new Date();
          const network = await getNetworkUsage({
            server,
            start: purchase.period_start,
            end,
          });
          purchase.cost = Math.max(0.001, network.cost);
          purchase.period_end = end;
          purchase.description.amount = network.amount;
          purchase.description.cost = network.cost;
          purchase.description.last_updated = end.valueOf();
          const pool = getPool();
          await pool.query(
            "UPDATE purchases SET cost=$1, period_end=$2, description=$3 WHERE id=$4",
            [
              purchase.cost,
              purchase.period_end,
              purchase.description,
              purchase.id,
            ],
          );
        }
      }
    } else {
      // We might update some network activity, in case it's stale.  This is so (1) the
      // user can see it, and (2) we can better keep track of whether they are running out
      // of money (you could probably easily spend $50/hour in network egress... so we
      // are still taking a very real risk!).
      for (const purchase of networkPurchases) {
        if (
          purchase.description.type == "compute-server-network-usage" &&
          purchase.period_end == null &&
          purchase.cost == null &&
          purchase.period_start != null
        ) {
          // currently active
          if (
            Date.now() -
              (purchase.description.last_updated ?? 0) -
              MIN_NETWORK_CLOSE_DELAY_MS >
            MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS
          ) {
            // not updated in a while, so let's update it
            const end = new Date(Date.now() - MIN_NETWORK_CLOSE_DELAY_MS * 2);
            const network = await getNetworkUsage({
              server,
              start: purchase.period_start,
              end,
            });
            purchase.description.amount = network.amount;
            purchase.description.cost = network.cost;
            purchase.description.last_updated = end.valueOf();
            const pool = getPool();
            await pool.query(
              "UPDATE purchases SET description=$1 WHERE id=$2",
              [purchase.description, purchase.id],
            );
          }
        }
      }
    }
  }

  // Rule 5: Split long compute server purchases?
  for (const purchase of purchases) {
    if (
      // this is why mutating the purchases objects when changing them in
      // database above is important, so we know not to mess with anything
      // we already closed.
      purchase.cost == null &&
      !purchase.period_end &&
      purchase.period_start
    ) {
      const howLongMs = Date.now() - purchase.period_start.valueOf();
      if (howLongMs > MAX_PURCHASE_LENGTH_MS) {
        // it's an ongoing purchase that is long, so split
        await closeAndContinuePurchase({ purchase, server });
      }
    }
  }
  // Also long network purchases, but there being careful to make
  // the stop time a bit in the past, so network total activity is known.
  for (const purchase of networkPurchases) {
    if (
      // this is why mutating the purchases objects when changing them in
      // database above is important, so we know not to mess with anything
      // we already closed.
      purchase.cost == null &&
      !purchase.period_end &&
      purchase.period_start
    ) {
      // 2*MIN_NETWORK_CLOSE_DELAY_MS to make it a little safer.
      // NOTE: There's no official guarantees here from Google and nothing is
      // fully safe.
      const howLongMs =
        Date.now() -
        purchase.period_start.valueOf() -
        2 * MIN_NETWORK_CLOSE_DELAY_MS;
      if (howLongMs > MAX_PURCHASE_LENGTH_MS) {
        // it's an ongoing *network* purchase this is long -- split it.
        await closeAndContinueNetworkPurchase({ purchase, server });
      }
    }
  }

  // Rule 6: Deal with low balance situations.  For now, if things are
  // getting "iffy", we stop the server, which greatly reduces the costs.
  // That's it. We'll do more later, e.g., delete it.
  if (stableState == "running" || stableState == "suspended") {
    // add up all of the partial costs that haven't been committed
    // to the users transactions yet.
    let cost = 0;
    for (const purchase of allPurchases) {
      if (purchase.cost != null || purchase.period_end != null) {
        // not a concern since it got closed above
        continue;
      }
      if (purchase.service == "compute-server") {
        // nothing to do -- this is already included in the balance that
        // isPurchaseAllowed uses
      } else if (
        purchase.service == "compute-server-network-usage" &&
        purchase.description.type == "compute-server-network-usage"
      ) {
        // right now uage based metered usage isn't included in the balance
        // in src/packages/server/purchases/get-balance.ts
        // When that changes, we won't need this loop at all.
        cost += purchase.description.cost;
      }
    }
    if (cost > 0) {
      // TODO: worried about service quotas compute-server versus compute-server-network-usage
      const isAllowed = await isPurchaseAllowed({
        account_id: server.account_id,
        service: "compute-server",
        cost: cost + COST_THRESH_DOLLARS,
      });
      if (!isAllowed) {
        // ut oh, running low on money. Turn VM off.
        logger.debug(
          "updatePurchase: attempting to stop server because user is low on funds",
          server.id,
        );
        // [ ] TODO: email user
        try {
          await stop(server);
        } catch (err) {
          logger.debug(
            "updatePurchase: attempt to stop server failed -- ",
            err,
          );
        }
      }
    }
  }
}

export async function updatePurchaseSoon(id: number) {
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET update_purchase=TRUE WHERE id=$1",
    [id],
  );
}

async function setPurchaseId({
  purchase_id,
  server_id,
  cost_per_hour,
  client,
}: {
  purchase_id: number | null;
  server_id: number;
  cost_per_hour: number;
  client?;
}) {
  if (purchase_id == null) {
    cost_per_hour = 0;
  }
  await (client ?? getPool()).query(
    "UPDATE compute_servers SET purchase_id=$1, cost_per_hour=$2 WHERE id=$3",
    [purchase_id, cost_per_hour, server_id],
  );
}

// Code below is similar to code in server/purchases/project-quotas.ts.
// NOTE: the purchase is mutated to reflect change to db.
async function closePurchase({
  purchase,
  client,
}: {
  purchase: Purchase;
  client?;
}) {
  logger.debug("closePurchase", purchase.id);
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
}) {
  logger.debug("closeAndContinuePurchase", purchase);
  if (purchase.cost != null || purchase.period_end != null) {
    logger.debug(
      "closeAndContinuePurchase: WARNING -- can't close and continue purchase because it is already closed",
    );
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
  } catch (err) {
    await client.query("ROLLBACK");
    logger.debug("closeAndContinuePurchase -- ERROR, rolling back", err);
    delete purchase.period_end;
    delete purchase.cost;
  } finally {
    client.release();
  }
}

export async function closeAndContinueNetworkPurchase({
  purchase,
  server,
}: {
  purchase: Purchase;
  server: ComputeServer;
}) {
  logger.debug("closeAndContinueNetworkPurchase", purchase);
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
    logger.debug(
      "closeAndContinueNetworkPurchase: WARNING -- wrong kind of purchase",
    );
    return;
  }
  newPurchase.time = end;
  newPurchase.period_start = end;
  newPurchase.description.amount = 0;
  newPurchase.description.cost = 0;
  newPurchase.description.last_updated = end.valueOf();
  const network = await getNetworkUsage({
    server,
    start: purchase.period_start,
    end,
  });
  const prevDescription = { ...purchase.description };
  if (purchase.description.type != "compute-server-network-usage") {
    logger.debug(
      "closeAndContinueNetworkPurchase: WARNING -- wrong kind of purchase",
    );
    return;
  }
  purchase.description.amount = network.amount;
  purchase.description.cost = network.cost;
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
    await createPurchase({ ...newPurchase, client });
    logger.debug("closeAndContinueNetworkPurchase -- closing old purchase");
    purchase.cost = Math.max(0.001, network.cost);
    purchase.period_end = end;
    await client.query(
      "UPDATE purchases SET cost=$1, period_end=$2 WHERE id=$3",
      [purchase.cost, purchase.period_end, purchase.id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.debug("closeAndContinueNetworkPurchase -- ERROR, rolling back", err);
    delete purchase.period_end;
    delete purchase.cost;
    purchase.description = prevDescription;
  } finally {
    client.release();
  }
}
