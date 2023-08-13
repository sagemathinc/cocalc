import cancelSubscription from "@cocalc/server/purchases/cancel-subscription";
import getName from "@cocalc/server/accounts/get-name";

export async function handleCancelSubscription({
  account_id,
  subscription_id,
}) {
  await cancelSubscription({ account_id, subscription_id });
  return {
    text: `Successfully canceled subscription with id ${subscription_id} for ${await getName(
      account_id
    )}. You can resume the subscription at any time [in the subscriptions page](/settings/statements).`,
  };
}
