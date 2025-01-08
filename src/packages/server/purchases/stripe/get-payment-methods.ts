import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";
import type { PaymentMethodData } from "@cocalc/util/stripe/types";

export default async function getPaymentMethods({
  account_id,
  ending_before,
  starting_after,
  limit,
}: {
  account_id: string;
  ending_before?: string;
  starting_after?: string;
  limit?: number;
}): Promise<PaymentMethodData> {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { has_more: false, data: [], object: "list" };
  }

  const stripe = await getConn();
  let x = await stripe.customers.listPaymentMethods(customer, {
    ending_before,
    starting_after,
    limit,
  });

  if (x.data.length > 0) {
    // almost make which is the default available
    const c = await stripe.customers.retrieve(customer);
    const default_payment_method = (c as any)?.invoice_settings
      ?.default_payment_method;
    return { ...x, default_payment_method };
  } else {
    return x;
  }
}

export async function hasPaymentMethod(account_id: string) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return false;
  }
  const stripe = await getConn();
  const methods = await stripe.customers.listPaymentMethods(customer, {
    limit: 1,
  });
  return methods.data.length >= 1;
}

export async function getPaymentMethod({
  account_id,
  id,
}: {
  account_id: string;
  id: string;
}) {
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    throw Error("no such payment method -- user doesn't have stripe identity");
  }
  return await stripe.customers.retrievePaymentMethod(customer, id);
}
