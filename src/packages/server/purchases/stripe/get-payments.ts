import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";
import { is_date } from "@cocalc/util/misc";

export default async function getPayments({
  account_id,
  created,
  ending_before,
  starting_after,
  limit,
}: {
  account_id: string;
  // these are all as seconds since epoch, and yes as a *string* or object with numbers.
  created?: string | { gt?: number; gte?: number; lt?: number; lte?: number };
  // see https://docs.stripe.com/api/payment_intents/list for meaning of ending_before and starting_after
  ending_before?: string;
  starting_after?: string;
  limit?: number;
}) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return [];
  }

  const stripe = await getConn();
  return await stripe.paymentIntents.list({
    customer,
    created,
    ending_before,
    starting_after,
    limit,
  });
}
