import { isValidUUID } from "@cocalc/util/misc";
import getConn from "@cocalc/server/stripe/connection";
import { getLogger } from "@cocalc/backend/logger";
import { getStripeCustomerId } from "@cocalc/server/purchases/stripe/util";

const log = getLogger("billing:get-invoices");

export default async function getInvoicesAndReceipts(account_id: string) {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return { data: [] };
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
  if (invoice_id.startsWith("pi_")) {
    // legacy fallback
    log.debug("actually a payment intent");
    return await stripe.paymentIntents.retrieve(invoice_id);
  }
  const invoice = await stripe.invoices.retrieve(invoice_id);
  log.debug("getInvoice", "obtained invoice", invoice);
  return invoice;
}

export async function getInvoiceUrl(
  invoice_id: string,
): Promise<string | null | undefined> {
  log.debug("getInvoice", invoice_id);
  const stripe = await getConn();
  if (invoice_id.startsWith("pi_")) {
    // legacy fallback
    log.debug("actually a payment intent");
    // have to get the charges, not the intent, since the intent doesn't include the charges...
    const charges = await stripe.charges.list({
      payment_intent: invoice_id,
    });
    return charges.data?.[0]?.receipt_url;
  }
  const invoice = await stripe.invoices.retrieve(invoice_id);
  log.debug("getInvoice", "obtained invoice", invoice);
  return invoice.hosted_invoice_url;
}
