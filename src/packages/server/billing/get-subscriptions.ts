import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";

export default async function getSubscriptions(
  account_id: string,
  pagination?: {
    // see https://stripe.com/docs/api/pagination
    limit?: number;
    ending_before?: string;
    starting_after?: string;
  }
): Promise<object> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  if (!(await stripe.get_customer_id())) {
    return {};
  }
  const mesg = await stripe.mesg_get_subscriptions(pagination);
  return mesg.subscriptions;
}
