import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {
  getStripeCustomerId,
  sanityCheckAmount,
} from ".//create-stripe-checkout-session";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";
import throttle from "@cocalc/server/api/throttle";
import createCredit from "./create-credit";

const logger = getLogger("purchases:create-payment-intent");

// create a new or modify the unfinished payment into
// with the given purpose.   If called again with the
// same purpose, but other parameters, then updates the
// existing one.

export async function createPaymentIntent({
  account_id,
  purpose,
  amount,
  description,
}: {
  // user created the payment intent -- assumed already authenticated/valid
  account_id: string;
  purpose: string;
  // amount of money in dollars.
  amount: number;
  // arbitrary string to show to the user
  description?: string;
}): Promise<PaymentIntentSecret> {
  logger.debug("createPaymentIntent", {
    account_id,
    amount,
    purpose,
    description,
  });
  if (!purpose) {
    throw Error("purpose must be set");
  }

  throttle({ account_id, endpoint: "create-payment-intent", interval: 2000 });

  await sanityCheckAmount(amount);
  const amountStripe = Math.ceil(amount * 100);

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }
  logger.debug("createPaymentIntent", { customer });

  const customerSession = await stripe.customerSessions.create({
    customer,
    components: {
      payment_element: {
        enabled: true,
        features: {
          payment_method_redisplay: "enabled",
          payment_method_save: "enabled",
          payment_method_save_usage: "off_session",
          payment_method_remove: "enabled",
        },
      },
    },
  });

  let paymentIntent;
  const intent = await getOpenPaymentIntent({ customer, purpose });
  if (intent != null) {
    paymentIntent = intent;
    await stripe.paymentIntents.update(paymentIntent.id, {
      amount: amountStripe,
      description,
      metadata: { purpose },
    });
  } else {
    paymentIntent = await stripe.paymentIntents.create({
      customer,
      amount: amountStripe,
      currency: "usd",
      metadata: { purpose },
    });
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    customerSessionClientSecret: customerSession.client_secret,
  };
}

export async function getOpenPaymentIntent({ customer, purpose }) {
  const stripe = await getConn();
  // we just want the most recent one that requires_payment_method, if any.
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  const query = `customer:"${customer}" AND metadata["purpose"]:"${purpose}" AND status:"requires_payment_method"`;
  const x = await stripe.paymentIntents.search({
    query,
    limit: 10,
  });
  // NOTE: the search index that stripe uses is wrong for a minute or two
  // (or maybe longer) after a payment completes, so we check each returned one
  // until finding one that really can be used.
  for (const intent of x.data) {
    if (
      intent.status == "requires_payment_method" &&
      intent.metadata.purpose == purpose
    ) {
      return intent;
    }
  }
  return undefined;
}

export async function processPaymentIntents(account_id): Promise<number> {
  throttle({
    account_id,
    endpoint: "process-payment-intents",
    interval: 10000,
  });
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
  const seen = new Set<string>();
  const purchase_ids = new Set<number>([]);
  const paymentIntents = recentPaymentIntents.data.concat(
    olderPaymentIntents.data,
  );
  for (const paymentIntent of paymentIntents) {
    if (seen.has(paymentIntent.id)) {
      continue;
    }
    seen.add(paymentIntent.id);
    if (
      paymentIntent.status == "succeeded" &&
      paymentIntent.metadata["processed"] != "true" &&
      paymentIntent.metadata["purpose"]
    ) {
      const id = await processPaymentIntent({ account_id, paymentIntent });
      purchase_ids.add(id);
    }
  }
  return purchase_ids.size;
}

async function processPaymentIntent({ account_id, paymentIntent }) {
  // credit the account.  If the account was already credited for this (e.g.,
  // by another process doing this at the same time), that should be detected
  // and is a no-op.
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
