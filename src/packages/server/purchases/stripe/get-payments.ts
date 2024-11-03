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

// These are all (relatively recent) purchases for a specific user that *should* get
// paid ASAP, but haven't for some reason (e.g., no card, broken card,
// bank tranfser, etc.).
export async function getAllOpenPayments(account_id: string) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return [];
  }

  // note that the query index is only updated *after a few seconds* to hour(s) so NOT reliable immediately!
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  const query = `customer:"${customer}" AND -metadata["purpose"]:null AND -status:"succeeded" AND -status:"canceled"`;
  const stripe = await getConn();
  const x = await stripe.paymentIntents.search({
    query,
    limit: 100, // should usually be very small, e.g., 0, 1 or 2.
  });
  // NOTE: the search index that stripe uses is wrong for a minute or two, so we do a "client side filter"
  x.data = x.data.filter((intent) => {
    if (!intent.metadata.purpose) {
      return false;
    }
    if (intent.metadata.confirm) {
      return intent.status != "succeeded" && intent.status != "canceled";
    } else {
      return intent.status != "requires_payment_method";
    }
    return false;
  });
  return x;
}