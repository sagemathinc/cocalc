import getLogger from "@cocalc/backend/logger";
import { stop } from "@cocalc/server/compute/control";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { setError } from "@cocalc/server/compute/util";

// turn VM off if you don't have at least this much extra:
const COST_THRESH_DOLLARS = 2.5;

const logger = getLogger("server:compute:maintenance:purchase:low-balance");

export default async function lowBalance({
  stableState,
  allPurchases,
  server,
}) {
  if (stableState != "running" && stableState != "suspended") {
    // TODO: for now we're just letting off VM's coast, rather than
    // deleting user data.    We will change this soon.  As it is,
    // they do get charged, and will be emailed and told to pay.
    // Our plan though will be to send emails and delete data after
    // e.g., XX days.
    return;
  }
  if (!(await checkAllowed(0, "compute-server", server))) {
    return;
  }

  // add up all of the partial costs that haven't been committed
  // to the users transactions yet.
  let cost = 0; // this is just network usage.
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
      // right now usage based metered usage isn't included in the balance
      // in src/packages/server/purchases/get-balance.ts
      // When that changes, we won't need this loop at all.
      cost += purchase.description.cost;
    }
  }
  await checkAllowed(cost, "compute-server-network-usage", server);
}

async function checkAllowed(cost: number, service, server) {
  const { allowed, reason } = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: cost + COST_THRESH_DOLLARS,
  });
  if (allowed) {
    return true;
  }
  // ut oh, running low on money. Turn VM off.
  logger.debug(
    "updatePurchase: attempting to stop server because user is low on funds",
    server.id,
  );
  // [ ] TODO: email user
  try {
    await stop(server);
    await setError(
      server.id,
      reason ??
        "You do not have enough credits to keep this compute server running. Add credits to your account or increase your spending limit.",
    );
  } catch (err) {
    logger.debug("updatePurchase: attempt to stop server failed -- ", err);
  }
  return false;
}
