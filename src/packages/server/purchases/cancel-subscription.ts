import getPool, { PoolClient } from "@cocalc/database/pool";
import getLicense from "@cocalc/server/licenses/get-license";

import editLicense, { costToChangeLicense } from "./edit-license";
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
    [now, subscription_id],
  );
  if (!cancelImmediately) {
    return;
  }

  const { license_id, end } = await cancelSubscriptionData(
    subscription_id,
    now,
  );
  if (end == null) {
    return;
  }

  // edit the corresponding license so that it ends now and users gets credit.
  await editLicense({
    isSubscriptionRenewal: true,
    account_id,
    license_id,
    changes: { end },
    note: "Canceling a subscription immediately.",
    client,
  });
}

export async function creditToCancelSubscription(
  subscription_id,
): Promise<number> {
  const { license_id, end } = await cancelSubscriptionData(
    subscription_id,
    new Date(),
  );
  if (end == null) {
    throw Error("not a valid subscription");
  }
  const { cost } = await costToChangeLicense({
    license_id,
    changes: { end },
    isSubscriptionRenewal: true,
  });
  return cost;
}

async function cancelSubscriptionData(
  subscription_id,
  now,
): Promise<{ license_id: string; end: Date | null }> {
  const subscription = await getSubscription(subscription_id);
  const { metadata, current_period_end } = subscription;
  const { license_id } = metadata;
  const license = await getLicense(license_id);
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
    return { license_id, end: null };
  }

  if (metadata?.type != "license" || metadata.license_id == null) {
    // only license subscriptions are currently implemented
    return { license_id, end: null };
  }

  return { license_id, end };
}
