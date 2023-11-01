/*
The function managePurchases that is exported from this file should be
called periodically and frequently from a *single* hub server. It
queries the database for compute servers with activity that warrants
possibly updating their purchases, then does that work.
*/

import { computeCost, getNetworkUsage } from "../control";
import getPool, {
  getTransactionClient,
  PoolClient,
} from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { cloneDeep } from "lodash";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
const logger = getLogger("server:compute:maintenance/manage-purchases");

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
    servers = rows;
    await client.query(
      "UPDATE compute_servers SET update_purchase=FALSE WHERE update_purchase=TRUE",
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
  for (const row of servers) {
    await updatePurchase(row);
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
  const networkPurchases = purchases.filter(
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

  - RULE 2: If there are no 'compute-server-network-usage' purchases and machine is running or starting,
    create such a purchase.

  - RULE 3: If there is a compute-server purchase and machine is in a stable state that is different
    from the purchase one (e.g., running vs off), end the current purchase.  If not deprovisioned,
    do a recursive call to create new purchase for new state.

  - RULE 4: If there is an ongoing 'compute-server-network-usage' purchase, possibly update it.
    If project is not running and it has been at least X minutes after stopping/deleting,
    update and close the purchase.  The issue here is just that network usage takes a few minutes to
    get recorded.

  - RULE 5: If the total duration of a purchase exceeds MAX_PURCHASE_INTERVAL_MS (e.g., 1 day),
    then we end that purchase and start another.
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
  if (networkPurchases.length == 0 && server.state == "running") {
    await createPurchase({
      client: null,
      account_id: server.account_id,
      project_id: server.project_id,
      service: "compute-server-network-usage",
      period_start: new Date(),
      description: {
        type: "compute-server-network-usage",
        compute_server_id: server.id,
        amount: 0, // starts at 0.
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
      if (server.state != purchase.description?.state) {
        // state changed, so end the purchase
        await closePurchase({
          server,
          purchase,
        });
        count += 1;
      }
    }
    if (count == purchases.length && stableState != "deprovisioned") {
      // everything was closed, but target stable state does cost,
      // so make new purchase for target state.
      // This is a recursive call.
      await updatePurchase({ ...server, state: stableState });
    }
  }

  // Rule 4: End current network purchase?

  // Rule 5: Split a long purchase?
}

// async function updatePurchaseSoon(id: number) {
//   const pool = getPool();
//   await pool.query(
//     "UPDATE compute_servers SET update_purchase=TRUE WHERE id=$1",
//     [id],
//   );
// }

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

async function closePurchase({
  server,
  purchase,
}: {
  server: ComputeServer;
  purchase: Purchase;
}) {
  logger.debug("closePurchase", purchase.id);
  const pool = getPool();
  if (purchase.period_end && purchase.cost) {
    // do not close purchase more than once:
    logger.debug("closePurchase -- already closed");
    return;
  }

  // Figure out the final cost.
  const start = purchase.period_start.valueOf();
  const now = Date.now();
  // at least 1 minute
  const hours = Math.max((now - start) / (1000 * 60 * 60), 1 / 60.0);
  const cost = Math.max(
    0.001, // always at least 0.1 penny to avoid abuse (?).
    hours * purchase.cost_per_hour,
  );
  // set the final cost, thus closing out this purchase.
  const period_end = new Date(now);
  await pool.query("UPDATE purchases SET cost=$1, period_end=$2 WHERE id=$3", [
    cost,
    period_end,
    purchase.id,
  ]);
}

// todo -- need to hook this into statements (?).
export async function closeAndContinuePurchase(
  id: number, // purchase id
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
  if (purchase.cost != null || purchase.period_end != null) {
    throw Error(
      "can't close and continue purchase because it is already closed",
    );
  }

  const now = new Date();
  const newPurchase = cloneDeep(purchase);
  delete newPurchase.id;
  newPurchase.time = now;
  newPurchase.period_start = now;

  // It's possible the cloud server rates changed, so we recompute the cost
  // in order to take that into account.
  const { rows: rows1 } = await pool.query(
    "SELECT * from compute_servers WHERE id=$1",
    [purchase.description.compute_server_id],
  );
  if (rows1.length == 0) {
    throw Error("no such compute server");
  }
  const server = rows1[0];
  const cost_per_hour = await computeCost({
    server,
    state: server.state,
  });
  newPurchase.cost_per_hour = cost_per_hour;

  logger.debug(
    "closeAndContinuePurchase -- creating newPurchase=",
    newPurchase,
  );
  const new_purchase_id = await createPurchase(newPurchase);
  logger.debug(
    "closeAndContinuePurchase -- update purchased in run_quota of project",
  );
  await setPurchaseId({
    purchase_id: new_purchase_id,
    server_id: server.id,
    cost_per_hour: purchase.cost_per_hour,
  });
  logger.debug("closeAndContinuePurchase -- closing old purchase", newPurchase);
  await closePurchase({
    server,
    cost_per_hour: purchase.cost_per_hour,
    period_start: purchase.period_start,
    client,
  });
}
