import { StripeClient } from "@cocalc/server/stripe/client";
import { isValidUUID } from "@cocalc/util/misc";
import { InvoicesData } from "@cocalc/util/types/stripe";
import getConn from "@cocalc/server/stripe/connection";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("billing:get-invoices");

export default async function getInvoicesAndReceipts(
  account_id: string
): Promise<InvoicesData> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid uuid");
  }
  const stripe = new StripeClient({ account_id });
  if (!(await stripe.get_customer_id())) {
    return {};
  }
  const mesg = await stripe.mesg_get_invoices({});
  return mesg.invoices;
}

export async function getInvoice(invoice_id: string) {
  log.debug("getInvoice", invoice_id);
  const conn = await getConn();
  const invoice = await conn.invoices.retrieve(invoice_id);
  log.debug("getInvoice", "obtained invoice", invoice);
  return invoice;
}
