import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId, getAccountIdFromStripeCustomerId } from "./util";
import getLogger from "@cocalc/backend/logger";
import createCredit from "@cocalc/server/purchases/create-credit";

const logger = getLogger("purchases:stripe:process-payment-intents");

export default async function processPaymentIntents({
  paymentIntents,
  account_id,
}: {
  account_id?: string;
  paymentIntents?;
}): Promise<number> {
  if (paymentIntents == null) {
    if (account_id == null) {
      // nothing to do
      return 0;
    }
    const customer = await getStripeCustomerId({ account_id, create: false });
    if (!customer) {
      return 0;
    }

    const stripe = await getConn();

    // all recent ones for this customer
    const recentPaymentIntents = await stripe.paymentIntents.list({ customer });

    // older ones that might have been missed:  this WILL miss newest from above due to time to update the stripe query index!
    // get payment intents with the new purpose metadata field set,
    // which are successful, and which have not been processed.
    // note that the index is slow to update, so we do not filter on status:"succeeded"
    // here, and instead do that in the loop below.
    const query = `customer:"${customer}" AND status:"succeeded" AND -metadata["processed"]:"true" -metadata["purpose"]:null`;
    const olderPaymentIntents = await stripe.paymentIntents.search({
      query,
      limit: 100,
    });
    paymentIntents = recentPaymentIntents.data.concat(olderPaymentIntents.data);
  }

  const seen = new Set<string>();
  const purchase_ids = new Set<number>([]);
  for (const paymentIntent of paymentIntents) {
    if (seen.has(paymentIntent.id)) {
      continue;
    }
    seen.add(paymentIntent.id);
    if (isReadyToProcess(paymentIntent)) {
      const id = await processPaymentIntent(paymentIntent);
      if (id) {
        purchase_ids.add(id);
      }
    }
  }
  return purchase_ids.size;
}

export function isReadyToProcess(paymentIntent) {
  return (
    paymentIntent.status == "succeeded" &&
    paymentIntent.metadata["processed"] != "true" &&
    paymentIntent.metadata["purpose"]
  );
}

export async function processPaymentIntent(paymentIntent) {
  let account_id = paymentIntent.metadata.account_id;
  logger.debug("processPaymentIntent", { id: paymentIntent.id, account_id });
  if (!account_id) {
    // this should never happen, but in case it does, we  lookup the account_id
    // in our database, based on the customer id.
    account_id = await getAccountIdFromStripeCustomerId(paymentIntent.customer);
    if (!account_id) {
      // no possible way to process this.
      logger.debug(
        "processPaymentIntent: unknown stripe customer",
        paymentIntent.customer,
      );
      return;
    }
  }

  // credit the account.  If the account was already credited for this (e.g.,
  // by another process doing this at the same time), that should be detected
  // and is a no-op, due to the invoice_id being unique amount purchases records
  // for this account (MAKE SURE!).
  const id = await createCredit({
    account_id,
    invoice_id: paymentIntent.id,
    amount: paymentIntent.amount / 100,
  });

  // make metadata so we won't consider this payment intent ever again
  const stripe = await getConn();
  await stripe.paymentIntents.update(paymentIntent.id, {
    metadata: { ...paymentIntent.metdata, processed: "true" },
  });

  return id;
}

// This allows for a periodic check that we have processed all recent payment
// intents across all users.  It should be called periodically.
// This should be called periodically as a maintenance task.
export async function processAllRecentPaymentIntents(): Promise<number> {
  const stripe = await getConn();

  // payments that might have been missed. This might miss something from up to 1-2 minutes ago
  // due to time to update the index, but that is fine given the point of this function.
  // We also use a small limit, since in almost all cases this will be empty, and if it is
  // not empty, we would just call it again to get more results.
  const query = `status:"succeeded" AND -metadata["processed"]:"true" -metadata["purpose"]:null`;
  const paymentIntents = await stripe.paymentIntents.search({
    query,
    limit: 10,
  });
  logger.debug(
    `processAllRecentPaymentIntents: considering ${paymentIntents.data.length} payments...`,
  );
  const purchase_ids = new Set<number>([]);
  for (const paymentIntent of paymentIntents.data) {
    if (isReadyToProcess(paymentIntent)) {
      const id = await processPaymentIntent(paymentIntent);
      if (id) {
        purchase_ids.add(id);
      }
    }
  }
  return purchase_ids.size;
}

export async function maintainPaymentIntents() {
  logger.debug("maintainPaymentIntents");
  // Right now we just call this. We could put in a longer interval between
  // calls (i.e. refuse to call too frequently if necessary).  Right now
  // this gets called every 5 minutes, which seems fine.
  await processAllRecentPaymentIntents();
}
