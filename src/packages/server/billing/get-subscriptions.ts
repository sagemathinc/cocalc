import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";

export default async function getSubscriptions(
  account_id: string
): Promise<object> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  if (!(await stripe.get_customer_id())) {
    return {};
  }
  const mesg = await stripe.mesg_get_subscriptions({});
  return mesg.subscriptions;
}
