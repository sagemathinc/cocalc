import knapsack from "@cocalc/util/knapsack";
import type { Items } from "@cocalc/util/knapsack";
import getPool, { PoolClient } from "@cocalc/database/pool";
import getBalance from "./get-balance";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:update-pending-purchases");

/*
If there are any purchases that are marked as pending, but there is now sufficient
balance to mark them as NOT pending, we do so.   We check this whenever the user
increases their balance, e.g., as a result of an automatic payment via a stripe
subscription, a refund, etc.
*/
export default async function updatePendingPurchases(
  account_id: string,
  client?: PoolClient
) {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    "SELECT id, cost FROM purchases WHERE account_id=$1 AND pending IS TRUE AND cost > 0",
    [account_id]
  );
  if (rows.length == 0) {
    logger.debug("nothing to do for", account_id);
    // nothing to do  -- there are no pending purchases
    return;
  }
  const balance = await getBalance(account_id, client);
  // Use approx solution to knapsack problem to mark an (almost) maximal set of
  // purchases as no longer pending.
  const purchase_ids = purchasesToMarkNotPending(rows, balance);
  logger.debug("updating pending purchases", {
    account_id,
    rows,
    purchase_ids,
  });
  await pool.query(
    "UPDATE purchases SET pending = false WHERE id = ANY($1::integer[])",
    [purchase_ids]
  );
}

function purchasesToMarkNotPending(
  purchases: { id: number; cost: number }[],
  balance: number
): number[] {
  // only considered pending purchases that cost <= balance:
  purchases = purchases.filter((x) => x.cost <= balance);
  if (purchases.length <= 1) {
    // easy -- no need to do anything fancy
    return purchases.map((x) => x.id);
  }
  // Now it could be more complicated.  We just try to maximize using up
  // as much of the balance as possible by setting the benefit to the cost.
  // I can't think of anything better since we a priori have no
  // good way to define the "benefit" of different pending purchases right now, this
  // is just about minizing the amount of money that is in this weird "pending" state.
  // "Amount of money" seems better than "number of transactions", obviously.
  // Maybe we will define a benefit score later, e.g.,
  // if the purchase corresponds to a subscription, the benefit could be a function of how
  // much the subscription is used.
  const input: Items = {};
  for (const { id, cost } of purchases) {
    input[id] = { cost, benefit: cost };
  }
  const { items } = knapsack(input, balance);
  return items.map((s) => parseInt(s));
}
