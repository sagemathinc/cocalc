import getPool from "@cocalc/database/pool";

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function cancelSubscription({
  account_id,
  subscription_id,
}: Options) {
  const pool = getPool();
  await pool.query(
    "UPDATE subscriptions SET status='canceled', canceled_at=NOW() WHERE id=$1 AND account_id=$2",
    [subscription_id, account_id]
  );
}

export async function resumeSubscription({
  account_id,
  subscription_id,
}: Options) {
  const pool = getPool();
  await pool.query(
    "UPDATE subscriptions SET status='active', resumed_at=NOW() WHERE id=$1 AND account_id=$2",
    [subscription_id, account_id]
  );
}
