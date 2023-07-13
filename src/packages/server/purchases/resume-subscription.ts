/*
Resume a subscription, which does all of the following in a single ATOMIC transaction.

- Changes the status of the subscription to active, so it'll get renewed each month.
- Sets the current_period_start/end dates for the subscription to include now.
- Edits the license so that start date is now and end date is current_period_end.
  Doing this edit involves a charge and will fail if user doesn't have sufficient 
  credit.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import editLicense from "./edit-license";
import { getSubscription, intervalContainingNow } from "./renew-subscription";

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function resumeSubscription({
  account_id,
  subscription_id,
}: Options): Promise<number | null | undefined> {
  const { current_period_end, interval, metadata } = await getSubscription(
    subscription_id
  );
  const { license_id } = metadata;
  const { start, end } = intervalContainingNow(current_period_end, interval);
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
        [subscription_id, account_id, start, end, purchase_id]
      );
    } else {
      await client.query(
        "UPDATE subscriptions SET status='active', resumed_at=NOW(), current_period_start=$3, current_period_end=$4 WHERE id=$1 AND account_id=$2",
        [subscription_id, account_id, start, end]
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
