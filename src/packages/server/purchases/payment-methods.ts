/* 
Stripe payment methods 

DEPRECATED: we won't be using this since we want to support 
sales tax and async payment even for subscriptions, etc., very 
well.
*/

import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./create-invoice";

export async function getPaymentMethods(account_id: string) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (customer == null) return [];

  const stripe = await getConn();
  const paymentMethods = await stripe.paymentMethods.list({
    customer,
  });
  return paymentMethods.data;
}
