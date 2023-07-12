import getPool from "@cocalc/database/pool";
import editLicense from "./edit-license";
import { getSubscription } from "./renew-subscription";
import dayjs from "dayjs";

interface Options {
  account_id: string;
  subscription_id: number;
  now?: boolean;
}

export default async function cancelSubscription({
  account_id,
  subscription_id,
  now,
}: Options) {
  const pool = getPool();
  await pool.query(
    "UPDATE subscriptions SET status='canceled', canceled_at=NOW() WHERE id=$1 AND account_id=$2",
    [subscription_id, account_id]
  );
  if (now) {
    const subscription = await getSubscription(subscription_id);
    const { metadata, current_period_end } = subscription;
    const end = dayjs().add(10, "minutes").toDate(); // 10 minutes in the future to avoid issues.
    if (current_period_end <= end) {
      // license already ended
      return;
    }
    if (metadata?.type != "license" || metadata.license_id == null) {
      // only license subscriptions are currently implemented
      return;
    }
    // edit the corresponding license so that it ends right now (and user gets credit).
    await editLicense({
      isSubscriptionRenewal: true,
      account_id,
      license_id: metadata.license_id,
      changes: { end },
      note: "Canceling a subscription immediately.",
    });
  }
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
