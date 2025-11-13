import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./util";

export default async function setDefaultSource({
  account_id,
  default_payment_method,
}: {
  account_id: string;
  default_payment_method: string;
}) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    throw Error("customer does not exist in stripe, so has no payment methods");
  }

  const stripe = await getConn();
  await stripe.customers.update(customer, {
    invoice_settings: { default_payment_method },
  });
}
