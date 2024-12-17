import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";
import processPaymentIntents from "./process-payment-intents";
import setShoppingCartPaymentIntent from "@cocalc/server/shopping/cart/payment-intent";
import type { StripeData } from "@cocalc/util/stripe/types";
import getPool from "@cocalc/database/pool";
//import getLogger from "@cocalc/backend/logger";
//const logger = getLogger("purchases:stripe:get-payments");

export default async function getPayments({
  account_id,
  created,
  ending_before,
  starting_after,
  limit,
  unfinished,
  canceled,
}: {
  account_id: string;
  // see https://docs.stripe.com/api/payment_intents/list for meaning of the params,
  // which we pass on EXACTLY to stripe.  In particular, dates are *seconds* since epoch,
  // sometimes as strings and sometimes as numbers.
  created?;
  ending_before?: string;
  starting_after?: string;
  limit?: number;
  // if given, ignore all other parameters (except canceled) and get all payments (up to 100 at least) during
  // the last month that are not in a finalized state, i.e., they could use attention.
  unfinished?: boolean;
  // if canceled also given, also include canceled payments with unfinished
  canceled?: boolean;
}): Promise<StripeData> {
  if (unfinished) {
    return await getAllOpenPayments(account_id, canceled);
  }

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

  // Only ever show users payment intents that will be redeemed for
  // actual money, e.g., there might be old intents from long ago
  // that are no longer meaningful, so do not show those.
  paymentIntents.data = paymentIntents.data.filter(
    (intent) =>
      intent.metadata?.total_excluding_tax_usd && !intent.metadata?.deleted,
  );

  if (!(created || ending_before || starting_after)) {
    await setBalanceAlert({ account_id, data: paymentIntents.data });
  }

  // if any payments haven't been processed, i.e., credit added to cocalc, do that here:
  await processPaymentIntents({ paymentIntents: paymentIntents.data });

  return paymentIntents;
}

// These are all (relatively recent) purchases for a specific user that *should* get
// paid ASAP, but haven't for some reason (e.g., no card, broken card,
// bank transfer, needs payment method, etc.).
export async function getAllOpenPayments(
  account_id: string,
  canceled?: boolean,
): Promise<StripeData> {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { has_more: false, data: [], object: "list" };
  }

  // note that the query index is only updated *after a few seconds* to hour(s) so NOT reliable immediately!
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  const query = `customer:"${customer}" AND -metadata["purpose"]:null AND -status:"succeeded" ${canceled ? "" : 'AND -status:"canceled"'}`;
  const stripe = await getConn();
  const x = await stripe.paymentIntents.search({
    query,
    limit: 100, // should usually be very small, e.g., 0, 1 or 2.
  });
  // NOTE: the search index that stripe uses is wrong for a minute or two, so we do a "client side filter"  console.log("x = ", x);
  x.data = x.data.filter(
    (intent) =>
      intent.metadata?.total_excluding_tax_usd &&
      (isOpenPaymentIntent(intent) ||
        (canceled && intent.status == "canceled")),
  );
  const known = new Set<string>();
  for (const intent of x.data) {
    known.add(intent.id);
    const cart_ids_json = intent.metadata?.cart_ids;
    if (!cart_ids_json || intent.status == "canceled") {
      continue;
    }
    // make sure these are marked properly as being purchased by this payment in the shopping cart.
    const cart_ids = JSON.parse(cart_ids_json);
    await setShoppingCartPaymentIntent({
      account_id,
      payment_intent: intent.id,
      cart_ids,
    });
  }

  await setBalanceAlert({ account_id, data: x.data });

  // We also include very recent (last 5 minutes) payments that haven't finished processing
  const y = await getPayments({
    account_id,
    created: { gt: Math.round((Date.now() - 5 * 1000 * 60) / 1000) },
    unfinished: false,
  });

  y.data = y.data.filter(isOpenPaymentIntent);
  for (const intent of y.data) {
    if (!known.has(intent.id) && !intent.metadata.processed) {
      x.data.push(intent);
    }
  }

  return { has_more: false, data: x.data, object: "list" };
}

function isOpenPaymentIntent(intent) {
  if (!intent.metadata.purpose || intent.metadata.deleted) {
    return false;
  }
  if (intent.metadata.confirm) {
    return intent.status != "succeeded" && intent.status != "canceled";
  } else {
    return intent.status != "requires_payment_method";
  }
  return false;
}

async function setBalanceAlert({ account_id, data }) {
  let n = 0;
  for (const intent of data) {
    if (
      !intent.metadata.purpose ||
      intent.metadata.deleted ||
      !intent.status?.startsWith("requires")
    ) {
      continue;
    }
    // basically count anything that's not deleted and
    // starts with "requires"
    n += 1;
  }
  const pool = getPool();
  await pool.query("UPDATE accounts SET balance_alert=$2 WHERE account_id=$1", [
    account_id,
    n > 0,
  ]);
}
