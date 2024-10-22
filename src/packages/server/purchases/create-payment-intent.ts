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
}: {
  account_id: string;
  line_items: Array<LineItem>;
}): Promise<PaymentIntentSecret> {
  logger.debug("createStripeCheckoutSession", account_id, line_items);

  throttle({ account_id, endpoint: "create-payment-intent", interval: 30000 });

  const amount = line_items.reduce(
    (total, line_item) => total + line_item.amount,
    0,
  );

  await sanityCheckAmount(amount);

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

  const paymentIntent = await stripe.paymentIntents.create({
    customer,
    amount: Math.ceil(amount * 100),
    currency: "usd",
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    customerSessionClientSecret: customerSession.client_secret,
  };
}
