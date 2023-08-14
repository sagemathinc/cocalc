import cancelSubscription from "@cocalc/server/purchases/cancel-subscription";
import getName from "@cocalc/server/accounts/get-name";
import getPool from "@cocalc/database/pool";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";

export async function handleCancelSubscription({ subscription_id }) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, status FROM subscriptions WHERE id=$1",
    [subscription_id]
  );
  const { account_id, status } = rows[0] ?? {};
  const email = await getEmailAddress(account_id);
  if (status == "canceled") {
    return {
      text: `Subscription with id ${subscription_id} is canceled.
\n\n- You can resume the subscription at any time [in the subscriptions page](/settings/subscriptions) for the user with email ${email}.`,
    };
  }

  await cancelSubscription({ account_id, subscription_id });
  return {
    text: `Successfully canceled subscription with id ${subscription_id} for ${await getName(
      account_id
    )}. You can resume the subscription at any time [in the subscriptions page](/settings/subscriptions) for the user with email ${email}.`,
  };
}

export async function extraInfo(description) {
  if (description.type != "cancel-subscription") {
    throw Error("description must be of type cancel-subscription");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, status FROM subscriptions WHERE id=$1",
    [description.subscription_id]
  );
  const { account_id, status } = rows[0] ?? {};
  if (account_id == null) {
    throw Error("invalid action token");
  }
  const email = await getEmailAddress(account_id);
  if (status == "canceled") {
    // already canceled
    return {
      ...description,
      title: `Subscription ${description.subscription_id}`,
      details: `Subscription ${description.subscription_id} is already canceled.
\n\n- You can resume any canceled subscription at [the subscriptions page](/settings/subscriptions) for the user with email ${email}.`,
      okText: "OK",
      icon: "calendar",
    };
  }

  return {
    ...description,
    title: `Cancel Subscription ${description.subscription_id}`,
    details: `Would you like to cancel subscription ${description.subscription_id}?
\n\n- You can always cancel, resume or change any of your subscription at [the subscriptions page](/settings/subscriptions) for the user with email ${email}.`,
    okText: "Cancel Subscription",
    icon: "calendar",
  };
}
