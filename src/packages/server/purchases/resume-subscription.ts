/*
Resume a canceled subscription, which does all of the following in a single ATOMIC transaction.

- Changes the status of the subscription to active, so it'll get renewed each month.
- Sets the current_period_start/end dates for the subscription to include now.
- Edits the license so that start date is now and end date is current_period_end.
  Doing this edit involves a charge and will fail if user doesn't have sufficient
  credit.
*/

import getPool, { getTransactionClient } from "@cocalc/database/pool";
import editLicense, { costToChangeLicense } from "./edit-license";
import { getSubscription, intervalContainingNow } from "./renew-subscription";
import {
  compute_cost,
  periodicCost as getPeriodicCost,
} from "@cocalc/util/licenses/purchase/compute-cost";

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function resumeSubscription({
  account_id,
  subscription_id,
}: Options): Promise<number | null | undefined> {
  const { license_id, start, end } =
    await getSubscriptionRenewalData(subscription_id);
  const client = await getTransactionClient();
  try {
    const { purchase_id } = await editLicense({
      account_id,
      license_id,
      changes: { end },
      note: "Resume a subscription. This is the prorated cost to pay for the remainder of the current period at current rates.",
      isSubscriptionRenewal: true,
      client,
    });

    if (purchase_id) {
      await client.query(
        "UPDATE subscriptions SET status='active', resumed_at=NOW(), current_period_start=$3, current_period_end=$4, latest_purchase_id=$5 WHERE id=$1 AND account_id=$2",
        [subscription_id, account_id, start, end, purchase_id],
      );
    } else {
      await client.query(
        "UPDATE subscriptions SET status='active', resumed_at=NOW(), current_period_start=$3, current_period_end=$4 WHERE id=$1 AND account_id=$2",
        [subscription_id, account_id, start, end],
      );
    }
    await client.query("COMMIT");
    return purchase_id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getSubscriptionRenewalData(subscription_id): Promise<{
  license_id: string;
  start: Date;
  end: Date;
  periodicCost: number;
}> {
  const {
    cost: currentCost,
    current_period_end,
    interval,
    metadata,
    status,
  } = await getSubscription(subscription_id);
  if (status != "canceled") {
    throw Error(
      `You can only resume a canceled subscription, but this subscription is "${status}"`,
    );
  }
  const { license_id } = metadata;
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT info FROM site_licenses where id=$1",
    [license_id],
  );
  const purchaseInfo = rows[0]?.info?.purchased;
  let periodicCost = currentCost;
  if (purchaseInfo != null) {
    const computedCost = compute_cost({
      ...purchaseInfo,
      start: null,
      end: null,
    });
    const newCost = getPeriodicCost(computedCost);
    if (newCost != currentCost) {
      await pool.query(`UPDATE subscriptions SET cost=$1 WHERE id=$2`, [
        newCost,
        subscription_id,
      ]);
      periodicCost = newCost;
    }
  }
  const { start, end } = intervalContainingNow(current_period_end, interval);
  return { license_id, start, end, periodicCost };
}

export async function costToResumeSubscription(
  subscription_id,
): Promise<{ cost: number; periodicCost: number }> {
  const { license_id, end, periodicCost } =
    await getSubscriptionRenewalData(subscription_id);
  const { cost } = await costToChangeLicense({
    license_id,
    changes: { end },
    isSubscriptionRenewal: true,
  });
  return { cost, periodicCost };
}
