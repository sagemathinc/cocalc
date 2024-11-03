import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";
import type { StripeData } from "@cocalc/util/stripe/types";

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
}): Promise<StripeData> {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { has_more: false, data: [], object: "list" };
  }

  const stripe = await getConn();
  return await stripe.customers.listPaymentMethods(customer, {
    ending_before,
    starting_after,
    limit,
  });
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
