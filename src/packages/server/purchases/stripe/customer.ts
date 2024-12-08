/*
Stripe Customer information.  This called "customer" because that is waht stripe calls it.

It's the stripe name, address and email for now, but later could support updating tax id, etc.
*/

import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";

export async function setCustomer(
  account_id,
  changes: { name?: string; address?; email?: string },
) {
  const customer_id = await getStripeCustomerId({ account_id, create: true });
  if (!customer_id) {
    throw Error("unable to get stripe customer id");
  }
  const stripe = await getConn();
  await stripe.customers.update(customer_id, {
    // NOTE: be a little paranoid in case user passes in some extra fields!
    name: changes.name,
    address: changes.address,
    email: changes.email,
  });
}

export async function getCustomer(account_id) {
  const customer_id = await getStripeCustomerId({ account_id, create: false });
  if (!customer_id) {
    return {};
  }
  const stripe = await getConn();
  const customer = await stripe.customers.retrieve(customer_id);
  if (customer.deleted) {
    return {};
  }
  // obviously, don't return *everything*.  Later may return more.
  return {
    name: customer.name,
    address: customer.address,
    email: customer.email,
  };
}
