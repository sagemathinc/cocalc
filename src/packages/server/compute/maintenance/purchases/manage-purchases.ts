/*
The function managePurchases that is exported from this file should be
called periodically and frequently from a *single* hub server. It
queries the database for compute servers with activity that warrants
possibly updating their purchases, then does that work.
*/

import {
  computeCost,
  getNetworkUsage,
  hasNetworkUsage,
  state,
} from "@cocalc/server/compute/control";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { setPurchaseId } from "./util";
import {
  closePurchase,
  closeAndContinuePurchase,
  closeAndPossiblyContinueNetworkPurchase,
} from "./close";
import lowBalance from "./low-balance";
import {
  GOOGLE_COST_LAG_MS,
  getInstanceTotalCost,
  haveBigQueryBilling,
} from "@cocalc/server/compute/cloud/google-cloud/bigquery";
import { getServerName } from "@cocalc/server/compute/cloud/google-cloud/index";
import adminAlert from "@cocalc/server/messages/admin-alert";
import { moneyToDbString, toDecimal } from "@cocalc/util/money";

const logger = getLogger("server:compute:maintenance:purchases:manage");

// we assumein close.ts that MIN_NETWORK_CLOSE_DELAY_MS is well over 1 hour.
export const MIN_NETWORK_CLOSE_DELAY_MS = 2 * 60 * 1000;

// a single purchase is split once it exceeds this length:
export const MAX_PURCHASE_LENGTH_MS = 1000 * 60 * 60 * 24;

// network purchasing info is updated this frequently for running servers
export const MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS = 1000 * 60 * 15;

// every *provisioned non-running server* gets purchases updated at least this often.
// We make this frequent enough to limit damage from abuse, but not too frequent
// to cause too much load on the database.
// Use PERIODIC_SHORT_UPDATE_INTERVAL_MS for servers that had some recent change:
export const PERIODIC_SHORT_UPDATE_INTERVAL_MS = 1000 * 60 * 2;

// Use PERIODIC_LONG_UPDATE_INTERVAL_MS for all servers
export const PERIODIC_LONG_UPDATE_INTERVAL_MS = 1000 * 60 * 60;

const lastAdminAlert: { [id: number]: number } = {};

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
      // at most one admin alert for a given server per 30 minutes...
      const now = Date.now();
      if (now - (lastAdminAlert[row.id] ?? 0) >= 30 * 1000 * 60) {
        lastAdminAlert[row.id] = now;
        adminAlert({
          subject:
            "Error managing a compute server purchase -- admin should investigate",
          body: `

Processing this row:

\`\`\`
${JSON.stringify(row, undefined, 2)}
\`\`\`

The following error happened: ${err}

This could result in a user not being properly charged or a long purchase being
left opened.  Please investigate!

`,
        });
      }
    }
  }
}

// get all outstanding current purchases involving this compute server
export async function outstandingPurchases(
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

export async function updatePurchase(server: ComputeServer) {
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

  **
  We define an "outstanding purchase" to be one for which the cost field is NULL.
  The end time may be set so the actual thing being purchase may have ended days
  ago.  This happens, e.g., with google networking and cloud storage, since we
  don't know how much the thing cost until days after it happened.
  **

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

  - RULE 4: If there is a 'compute-server-network-usage' purchase, possibly update it.
    If project is not running and it has been at least X minutes after stopping/deleting,
    update and close the purchase, which means setting the end time (but not necessarily cost!).
    The issue here is just that network usage takes a few minutes to get recorded.
    In addition, as part of this step, for purchases that ended days ago, we query
    google for their actual cost and fill it in (if the appropriate service account, etc.
    is actually available -- bigquery won't be hit from CI).

  - RULE 5: If the total duration of a purchase exceeds MAX_PURCHASE_INTERVAL_MS
    (e.g., 1 day), then we end that purchase and start another.

  - RULE 6: Balance actions -- **PARTIALLY IMPLEMENTED ONLY**
       - If balance is low, email user suggesting they add credit to their account
         or enable automatic billing.
       - If balance is lower, use automatic billing if possible (in no way implemented yet).
         If not, stop any running compute servers.
       - If balance drops too low, deprovision everything.
  */

  if (server.state == "unknown" || !server.state) {
    logger.debug("WARNING: server.state not known so recomputing", server);
    server.state = await state({ ...server, maintenance: true });
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
    await createComputeServerPurchase({ server, stableState });
  }

  // Rule 2: creating compute-server-network-usage purchase
  if (
    networkPurchases.length == 0 &&
    server.state == "running" &&
    hasNetworkUsage(server.cloud)
  ) {
    await createNetworkUsagePurchase({ server });
  }

  // Rule 3: End purchases for different state?
  if (server.state == stableState && purchases.length > 0) {
    await endOtherStatePurchases({ purchases, server, stableState });
  }

  // Rule 4: End any networking purchases that we should end, and also
  // update the total amount of network usage periodically, so user
  // can see it.  (This is currently only for google cloud.)
  if (networkPurchases.length > 0) {
    await manageNetworkPurchases({ networkPurchases, server, stableState });
  }

  // Rule 5: Split long purchases?
  await splitLongPurchases({ purchases, networkPurchases, server });

  // Rule 6: Deal with low balance situations.  For now, if things are
  // getting "iffy", we stop the server, which greatly reduces the costs.
  // If they get even worse, we deprovision it. Emails are sent.
  await lowBalance({ server });
}

async function createComputeServerPurchase({ server, stableState }) {
  const cost_per_hour = await computeCost({ server, state: stableState });

  if (!cost_per_hour) {
    // no need to make a new purchase, e.g., deprovisioned is free.
    await setPurchaseId({
      purchase_id: null,
      server_id: server.id,
      cost_per_hour,
    });
  } else {
    logger.debug(`start new pay-as-you-go purchase for ${cost_per_hour}/hour`);
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

async function createNetworkUsagePurchase({ server }) {
  await createPurchase({
    client: null,
    account_id: server.account_id,
    project_id: server.project_id,
    service: "compute-server-network-usage",
    cost_so_far: 0,
    period_start: new Date(),
    description: {
      type: "compute-server-network-usage",
      compute_server_id: server.id,
      amount: 0,
      last_updated: Date.now(),
    },
  });
}

async function endOtherStatePurchases({ purchases, server, stableState }) {
  if (purchases.length > 1) {
    // this should be impossible so we warn; we can handle it fine below though.
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

async function manageNetworkPurchases({
  networkPurchases,
  server,
  stableState,
}) {
  logger.debug(
    "manageNetworkPurchases:",
    networkPurchases.length,
    " purchases",
  );
  if (networkPurchases.length == 0) {
    // nothing to do
    return;
  }

  // compute final costs of any sufficiently long closed network purchases (via bigquery)
  await computeNetworkPurchaseCosts({ networkPurchases, server });

  if (
    server.state != "running" &&
    stableState != "running" &&
    server.state_changed &&
    Date.now() - server.state_changed.valueOf() >= MIN_NETWORK_CLOSE_DELAY_MS
  ) {
    // It's not running and it's not about to be running, and the last
    // state change was at least a little bit in the past.  In this case
    // there can be no network activity, so we end all the network
    // purchases (that aren't too recent):
    await endNetworkPurchases({ networkPurchases, server });
  } else {
    // We might update some network activity, in case it's stale.  This is so (1) the
    // user can see it, and (2) we can better keep track of whether they are running out
    // of money (you could probably easily spend $50/hour in network data tranfser out... so we
    // are still taking a very real risk!).
    await updateNetworkUsage({ networkPurchases, server });
  }
}

export async function computeNetworkPurchaseCosts({
  networkPurchases,
  server,
}) {
  const cutoff = Date.now() - GOOGLE_COST_LAG_MS;
  const purchases = networkPurchases.filter(
    ({ period_end, cost }) =>
      period_end != null && cost == null && period_end.valueOf() <= cutoff,
  );
  if (purchases.length == 0) {
    logger.debug(
      "computeNetworkPurchaseCosts: no purchases needing final cost computation",
    );
    return;
  }
  if (!(await haveBigQueryBilling())) {
    // give up
    logger.debug(
      "computeNetworkPurchaseCosts: WARNING: we can never close out network purchases until BigQuery detailed billing export is configured.",
    );
    return;
  }
  for (const purchase of purchases) {
    logger.debug(
      "computeNetworkPurchaseCosts: need to compute cost of network usage",
      purchase,
    );
    const name = await getServerName(server);
    const end = new Date(purchase.period_end.valueOf() + 30000);
    // for the start, we round down to the previous hour.  Why?
    //   Rounding down does nothing if this was got by close network
    //   purchase because we already round those down.
    //   Rounding down includes the period in the google intervals
    //   if the server was newly started.
    let start = new Date(purchase.period_start.valueOf());
    start.setSeconds(0);
    start.setMinutes(0);
    start = new Date(start.valueOf() - 30000);
    // We always subtract 30 seconds because of the milliseconds:
    // > a = new Date(); a.setSeconds(0); a.setMinutes(0); a
    // 2024-06-27T17:00:00.751Z
    const totalCost = await getInstanceTotalCost({ name, start, end });
    const networkCostValue = toDecimal(totalCost.network ?? 0);
    purchase.cost = networkCostValue.toNumber();
    purchase.description.cost = networkCostValue.toNumber();
    const pool = getPool();
    await pool.query(
      "UPDATE purchases SET cost=$1, description=$2 WHERE id=$3",
      [moneyToDbString(networkCostValue), purchase.description, purchase.id],
    );
  }
}

async function endNetworkPurchases({ networkPurchases, server }) {
  for (const purchase of networkPurchases) {
    if (purchase.period_end != null) {
      // this has already been ended.
      continue;
    }
    // only take purchases that started at least MIN_NETWORK_CLOSE_DELAY_MS ago,
    // since a new one could have started and we don't want to end that.
    if (
      purchase.period_start &&
      purchase.description.type == "compute-server-network-usage" &&
      Date.now() - purchase.period_start.valueOf() > MIN_NETWORK_CLOSE_DELAY_MS
    ) {
      const end = new Date();
      const network = await getNetworkUsage({
        server,
        start: purchase.period_start,
        end,
      });
      purchase.period_end = end;
      purchase.description.amount = network.amount;
      purchase.description.last_updated = end.valueOf();
      // We very explicitly do NOT set any cost here.  That will only be done 2 days
      // later via queries to BigQuery based on detailed billing export.
      // The purchase.description.amount may be used for display and to provide an estimate
      // and that's it.
      const pool = getPool();
      await pool.query(
        "UPDATE purchases SET cost=NULL, cost_so_far=NULL, period_end=$1, description=$2 WHERE id=$3",
        [purchase.period_end, purchase.description, purchase.id],
      );
    }
  }
}

async function updateNetworkUsage({ networkPurchases, server }) {
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
        purchase.description.last_updated = end.valueOf();
        const pool = getPool();
        await pool.query("UPDATE purchases SET description=$1 WHERE id=$2", [
          purchase.description,
          purchase.id,
        ]);
      }
    }
  }
}

async function splitLongPurchases({ purchases, networkPurchases, server }) {
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
        // it's an ongoing *network* purchase that is long, so split it.
        await closeAndPossiblyContinueNetworkPurchase({ purchase, server });
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
