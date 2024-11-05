/*

"A SetupIntent guides you through the process of setting up and saving a
customer’s payment credentials for future payments. For example, you can use a
SetupIntent to set up and save your customer’s card without immediately
collecting a payment. Later, you can use PaymentIntents to drive the payment
flow." -- https://docs.stripe.com/api/setup_intents
*/

import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {  getStripeCustomerId } from "./util";

const logger = getLogger("purchases:stripe:create-setup-intent");

export default async function createSetupIntent({
  account_id,
  description,
}: {
  account_id: string;
  description?: string;
}): Promise<{ clientSecret: string }> {
  logger.debug("createSetupIntent", { account_id });

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("createSetupIntent -- create setup intent for", { customer });

  const setupIntent = await stripe.setupIntents.create({
    customer,
    description,
    automatic_payment_methods: { enabled: true, allow_redirects: "always" },
    usage: "off_session",
    metadata: { account_id },
    use_stripe_sdk: true,
  });

  if (setupIntent.client_secret == null) {
    throw Error("bug -- client_secret should be defined");
  }

  return { clientSecret: setupIntent.client_secret };
}
