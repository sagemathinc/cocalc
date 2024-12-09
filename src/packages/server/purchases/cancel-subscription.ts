import getPool, { PoolClient } from "@cocalc/database/pool";
import send, { support, url } from "@cocalc/server/messages/send";

interface Options {
  account_id: string;
  subscription_id: number;
  reason?: string;
  client?: PoolClient;
}

export default async function cancelSubscription({
  account_id, // only used for added security
  subscription_id,
  reason = "no reason specified",
  client,
}: Options) {
  const pool = client ?? getPool();
  const now = new Date();

  await pool.query(
    "UPDATE subscriptions SET status='canceled', canceled_at=$1, canceled_reason=$2 WHERE id=$3 AND account_id=$4",
    [now, reason, subscription_id, account_id],
  );
  await sendCancelNotification({ subscription_id, client });
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
