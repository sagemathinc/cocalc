import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId, sanityCheckAmount } from "./stripe-util";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";
import throttle from "@cocalc/server/api/throttle";
import createCredit from "./create-credit";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";

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

  // packages/frontend/purchases/stripe-payment.tsx assumes that this interval below
  // is 2seconds or less.
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
      metadata: { purpose, account_id },
    });
  } else {
    paymentIntent = await stripe.paymentIntents.create({
      customer,
      amount: amountStripe,
      currency: "usd",
      metadata: { purpose, account_id },
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
  const recentPaymentIntents = await stripe.paymentIntents.list({ customer });
  for (const intent of recentPaymentIntents.data) {
    if (
      intent.status == "requires_payment_method" &&
      intent.metadata.purpose == purpose
    ) {
      return intent;
    }
  }

  // note that the query index is only updated *after a few seconds* so NOT reliable.
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
    if (isReadyToProcess(paymentIntent)) {
      const id = await processPaymentIntent(paymentIntent);
      if (id) {
        purchase_ids.add(id);
      }
    }
  }
  return purchase_ids.size;
}

function isReadyToProcess(paymentIntent) {
  return (
    paymentIntent.status == "succeeded" &&
    paymentIntent.metadata["processed"] != "true" &&
    paymentIntent.metadata["purpose"]
  );
}

async function processPaymentIntent(paymentIntent) {
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

// this gets the account_id with a given stripe_id....
export async function getAccountIdFromStripeCustomerId(
  customer: string,
): Promise<string | undefined> {
  const pool = getPool();
  // I think this is a linear search on the entire accounts table, probably.
  // This should basically never happen, but I'm implementing it just
  // in case.
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE stripe_customer_id=$1",
    [customer],
  );
  if (rows.length == 1) {
    // clear answer and done
    return rows[0]?.account_id;
  }
  // Next query stripe itself:
  const stripe = await getConn();
  try {
    const customerObject = await stripe.customers.retrieve(customer);
    const account_id = customerObject["metadata"]?.["account_id"];
    if (account_id && (await isValidAccount(account_id))) {
      // check if it is valid, because, e.g., stripe might have all kinds
      // of crazy data... e.g., all dev servers use the SAME stripe testing
      // account.  Also the account could be purged from our records, so
      // no further processing is possible.
      return account_id;
    }
  } catch (_err) {
    // ddidn't find via stripe
  }
  // at least try the first result if there is more than 1, or return undefined.
  return rows[0]?.account_id;
}
