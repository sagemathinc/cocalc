import { isValidUUID } from "@cocalc/util/misc";
import getConn from "@cocalc/server/stripe/connection";
import { getLogger } from "@cocalc/backend/logger";
import { getStripeCustomerId } from "@cocalc/server/purchases/create-stripe-checkout-session";

const log = getLogger("billing:get-invoices");

export default async function getInvoicesAndReceipts(account_id: string) {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { data: {} };
  }
  const stripe = await getConn();
  const invoices = await stripe.invoices.list({
    customer,
    limit: 30,
  });
  return invoices;
}

export async function getInvoice(invoice_id: string) {
  log.debug("getInvoice", invoice_id);
  const stripe = await getConn();
  const invoice = await stripe.invoices.retrieve(invoice_id);
  log.debug("getInvoice", "obtained invoice", invoice);
  return invoice;
}
