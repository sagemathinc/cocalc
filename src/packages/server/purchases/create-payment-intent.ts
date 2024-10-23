import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {
  getStripeCustomerId,
  sanityCheckAmount,
} from ".//create-stripe-checkout-session";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";
import throttle from "@cocalc/server/api/throttle";

const logger = getLogger("purchases:create-payment-intent");

// create a new or modify the unfinished payment into
// with the given purpose.   If called again with the
// same purpose, but other parameters, then updates the
// existing one.

export default async function createPaymentIntent({
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
  // we just want the most recent one not in a non-terminal state, if any.
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  const query = `customer:"${customer}" AND metadata["purpose"]:"${purpose}" AND -status:"succeeded" AND -status:"canceled"`;
  const x = await stripe.paymentIntents.search({
    query,
    limit: 1,
  });
  return x.data[0];
}
