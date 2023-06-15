/*
Get all unpaid stripe invoices for the given account.
*/

import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "./create-invoice";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:get-unpaid-invoices");

export default async function getUnpaidInvoices(account_id: string): Promise<any[]> {
  logger.debug("account_id = ", account_id);
  const customer = await getStripeCustomerId({  account_id, create:  false  });
  if (!customer) return [];
  logger.debug("customer = ", account_id);
  const stripe = await getConn();
  const invoices = await stripe.invoices.list({
    customer,
    status: "open",
    limit: 100,
  });
  return invoices.data;
}
