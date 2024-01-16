import getPool, { PoolClient } from "@cocalc/database/pool";
import getLicense from "@cocalc/server/licenses/get-license";

import editLicense from "./edit-license";
import { getSubscription } from "./renew-subscription";

interface Options {
  account_id: string;
  subscription_id: number;
  cancelImmediately?: boolean;
  client?: PoolClient;
}

export default async function cancelSubscription({
  account_id,
  subscription_id,
  cancelImmediately,
  client,
}: Options) {
  const pool = client ?? getPool();
  const now = new Date();

  await pool.query(
    "UPDATE subscriptions SET status='canceled', canceled_at=$1 WHERE id=$2",
    [now, subscription_id]
  );
  if (cancelImmediately) {
    const subscription = await getSubscription(subscription_id);
    const { metadata, current_period_end } = subscription;
    const license = await getLicense(metadata.license_id);
    let end;

    if (license.activates != null && new Date(license.activates) > now) {
      // activation in the future
      end = new Date(license.activates);
    } else {
      end = now;
    }

    if (
      (license.expires != null && new Date(license.expires) <= end) ||
      current_period_end <= end
    ) {
      // license already ended
      return;
    }

    if (metadata?.type != "license" || metadata.license_id == null) {
      // only license subscriptions are currently implemented
      return;
    }

    // edit the corresponding license so that it ends either
    //
    // a) now, or
    // b) at the same instant of activation
    //
    // (and user gets credit)
    //
    await editLicense({
      isSubscriptionRenewal: true,
      account_id,
      license_id: metadata.license_id,
      changes: { end },
      note: "Canceling a subscription immediately.",
      client,
    });
  }
}
