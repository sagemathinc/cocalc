import getPool, { PoolClient } from "@cocalc/database/pool";
import getLicense from "@cocalc/server/licenses/get-license";
import editLicense, { costToChangeLicense } from "./edit-license";
import { getSubscription } from "./renew-subscription";
import send, { support, url } from "@cocalc/server/messages/send";

interface Options {
  account_id: string;
  subscription_id: number;
  cancelImmediately?: boolean;
  reason?: string;
  client?: PoolClient;
}

export default async function cancelSubscription({
  account_id,
  subscription_id,
  cancelImmediately,
  reason = "no reason specified",
  client,
}: Options) {
  const pool = client ?? getPool();
  const now = new Date();

  await pool.query(
    "UPDATE subscriptions SET status='canceled', canceled_at=$1, canceled_reason=$2 WHERE id=$3",
    [now, reason, subscription_id],
  );
  await sendCancelNotification({ subscription_id, client });
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

export async function sendCancelNotification({
  subscription_id,
  client,
}: {
  subscription_id: number;
  client?: PoolClient;
}) {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    "SELECT account_id, canceled_reason FROM subscriptions where id=$1",
    [subscription_id],
  );
  if (rows.length == 0) {
    return;
  }
  const { account_id, canceled_reason } = rows[0];

  const subject = `Subscription (id=${subscription_id}) Canceled`;
  const body = `
This is a confirmation that your subscription (id=${subscription_id}) was canceled.

**REASON:** ${canceled_reason}

You can easily [resume or edit this subscription at any time](${await url("subscriptions", subscription_id)}).

${await support()}
`;

  await send({
    to_ids: [account_id],
    subject,
    body,
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
