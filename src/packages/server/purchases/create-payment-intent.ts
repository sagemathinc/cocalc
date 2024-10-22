import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {
  getStripeCustomerId,
  sanityCheckAmount,
} from ".//create-stripe-checkout-session";
import type { LineItem, PaymentIntentSecret } from "@cocalc/util/stripe/types";
import throttle from "@cocalc/server/api/throttle";

const logger = getLogger("purchases:create-payment-intent");

export default async function createPaymentIntent({
  account_id,
  line_items,
  purpose,
}: {
  account_id: string;
  line_items: Array<LineItem>;
  purpose: string;
}): Promise<PaymentIntentSecret> {
  logger.debug("createPaymentIntent", { account_id, line_items, purpose });
  if (!purpose) {
    throw Error("purpose must be set");
  }

  throttle({ account_id, endpoint: "create-payment-intent", interval: 3000 });

  const total = line_items.reduce(
    (total, line_item) => total + line_item.amount,
    0,
  );

  await sanityCheckAmount(total);
  const amount = Math.ceil(total * 100);

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
    await stripe.paymentIntents.update(paymentIntent.id, { amount });
  } else {
    paymentIntent = await stripe.paymentIntents.create({
      customer,
      amount,
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
  // we just want the most recent non-success one, if any.
  const query = `customer:"${customer}" AND metadata["purpose"]:"${purpose}" AND -status:"succeeded"`;
  console.log({ query });
  const x = await stripe.paymentIntents.search({
    query,
    limit: 1,
  });
  return x.data[0];
}
