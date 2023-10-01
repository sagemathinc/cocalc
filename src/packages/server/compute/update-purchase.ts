import { computeCost, getNetworkUsage } from "./control";
import getPool, { PoolClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { cloneDeep } from "lodash";
import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import {
  getTargetState,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
const logger = getLogger("server:compute:update-purchase");

// TODO: we call this a lot and it might be a good idea to throttle the calls (?).

export default async function updatePurchase({
  server,
  newState: newState0,
}: {
  server: ComputeServer;
  newState: State;
}) {
  if (newState0 != "starting" && !STATE_INFO[newState0]?.stable) {
    // don't change purchase while in non-stable states, except starting (since cloud
    // providers charge us right when machine begins starting)
    return;
  }
  const newState = getTargetState(newState0);
  logger.debug("update purchase", { server_id: server.id, newState });
  if (newState == "deprovisioned" && server.purchase_id == null) {
    // nothing to do -- purchase already cleared
    // This is an unlikely special case, but might as well...
    return;
  }

  // determine cost in new state
  const cost_per_hour = await computeCost({ server, state: newState });

  if (server.purchase_id != null) {
    logger.debug(
      "there's an existing purchase right now; id=",
      server.purchase_id,
    );
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT cost_per_hour, description, period_start, period_end FROM purchases WHERE id=$1",
      [server.purchase_id],
    );
    if (rows.length > 0) {
      const {
        cost_per_hour: cost_per_hour0,
        description,
        period_start,
        period_end,
      } = rows[0];
      if (period_end == null) {
        // The current purchase is still active.

        if (
          description.state == newState &&
          Math.abs(cost_per_hour - cost_per_hour0) < 0.0001
        ) {
          logger.debug("keep purchase going -- no change");
          return;
        }

        logger.debug("stop current purchase");
        await closePurchase({
          server,
          cost_per_hour: cost_per_hour0,
          period_start,
        });
      }
    }
    // now there is no active purchase
  }

  if (!cost_per_hour || newState == "deprovisioned") {
    // no need to make a new purchase -- deprovisioned is free.
    await setPurchaseId({
      purchase_id: null,
      server_id: server.id,
      cost_per_hour: 0,
    });
    return;
  }

  logger.debug("start new pay-as-you-go purchase");
  const purchase_id = await createPurchase({
    client: null,
    account_id: server.account_id,
    project_id: server.project_id,
    service: "compute-server",
    period_start: new Date(),
    cost_per_hour,
    description: {
      type: "compute-server",
      state: newState,
      compute_server_id: server.id,
      configuration: server.configuration,
    },
  });

  await setPurchaseId({ purchase_id, server_id: server.id, cost_per_hour });
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

async function closePurchase({
  server,
  cost_per_hour,
  period_start,
  client,
}: {
  server: ComputeServer;
  cost_per_hour: number;
  period_start: Date;
  client?: PoolClient;
}) {
  const id = server.purchase_id;
  logger.debug("closePurchase", id);
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    "SELECT period_end, cost FROM purchases WHERE id=$1",
    [id],
  );
  if (rows[0]?.period_end && rows[0]?.cost) {
    // do not close purchase more than once:
    logger.debug("closePurchase", id, " -- already closed");
    return;
  }

  // Figure out the final cost.
  const start = period_start.valueOf();
  const now = Date.now();
  // at least 1 minute
  const hours = Math.max((now - start) / (1000 * 60 * 60), 1 / 60.0);
  const cost = Math.max(
    0.001, // always at least 0.1 penny to avoid abuse (?).
    hours * cost_per_hour,
  );
  // set the final cost, thus closing out this purchase.
  const period_end = new Date(now);
  await pool.query("UPDATE purchases SET cost=$1, period_end=$2 WHERE id=$3", [
    cost,
    period_end,
    id,
  ]);

  // If server was recently then we also record purchase for
  // any network usage.
  if (server.state == "running" || server.state == "stopping") {
    // [ ] TODO: we may want to wait some minutes before
    // running the network usage computation, since usage
    // isn't all reported until a few minutes after it happens.
    const network = await getNetworkUsage({
      server,
      start: period_start,
      end: new Date(),
    });
    if (network.cost) {
      await createPurchase({
        client: null,
        account_id: server.account_id,
        project_id: server.project_id,
        service: "compute-server-network-usage",
        period_start,
        period_end,
        cost: network.cost,
        description: {
          type: "compute-server-network-usage",
          compute_server_id: server.id,
          amount: network.amount,
        },
      });
    }
  }
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
