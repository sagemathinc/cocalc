import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {  getStripeCustomerId } from "./util";

const logger = getLogger("purchases:stripe:create-subscription-payment");

export default async function createSubscriptionPayment({
  account_id,
  subscription_id,
}: {
  account_id: string;
  subscription_id: number;
}) {
  logger.debug("createSubscriptionPayment", { account_id, subscription_id });

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("createSetupIntent -- create setup intent for", { customer });
}
