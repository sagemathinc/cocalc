import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";
import processPaymentIntents from "./process-payment-intents";
import type { StripeData } from "@cocalc/util/stripe/types";

export default async function getPayments({
  account_id,
  created,
  ending_before,
  starting_after,
  limit,
}: {
  account_id: string;
  // see https://docs.stripe.com/api/payment_intents/list for meaning of the params,
  // which we pass on EXACTLY to stripe.  In particular, dates are *seconds* since epoch,
  // sometimes as strings and sometimes as numbers.
  created?;
  ending_before?: string;
  starting_after?: string;
  limit?: number;
}): Promise<StripeData> {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { has_more: false, data: [], object: "list" };
  }

  const stripe = await getConn();
  const paymentIntents = await stripe.paymentIntents.list({
    customer,
    created,
    ending_before,
    starting_after,
    limit,
  });

  // if any payments haven't been processed, i.e., credit added to cocalc, do that here:
  await processPaymentIntents({ paymentIntents: paymentIntents.data });

  return paymentIntents;
}
