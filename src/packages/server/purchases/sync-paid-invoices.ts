/*
DEPRECATED


Get recent (last 10, during last day) paid stripe invoices
for the given account, and make sure that we have properly
credited the user for them.

NOTE: This shouldn't be necessary if webhooks were 100%
reliable, which maybe they are.  However, for dev purposes,
and my piece of mind I'm doing this, since I really hate
the idea of a user paying us and not getting what they
paid for!  It's nice to have a backup to make sure things
work, in case either webhooks are messed up, or our handling
of a webhook is buggy.

RIGHT NOW: This ONLY consideres invoices that are for crediting
the purchases account. These are defined by having

     invoice.metadata.service = "credit"
     invoice.metadata.account_id is set.
*/

import getConn from "@cocalc/server/stripe/connection";
import {
  getStripeCustomerId,
  createCreditFromPaidStripeInvoice,
} from "./create-invoice";
import getLogger from "@cocalc/backend/logger";
import dayjs from "dayjs";

const logger = getLogger("purchases:sync-paid-invoices");

export async function getPaidInvoices(
  account_id: string,
  limit?: number,
  created?: Date // greater than or equal to this date
): Promise<any[]> {
  logger.debug("account_id = ", account_id);
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    // not a customer, so they can't have any invoices.
    return [];
  }
  logger.debug("customer = ", account_id);
  const stripe = await getConn();
  const invoices = await stripe.invoices.list({
    customer,
    status: "paid",
    limit,
    created:
      created != null
        ? { gte: Math.round(created.valueOf() / 1000) }
        : undefined,
  });
  return invoices.data;
}

// Sync recent (last day) invoices that the user paid to get a credit, but didn't get
// reported via a webhook.  This is just a waste of resources if webhooks are configured
// and fully working.  It gets called by the frontend after adding credit.  Returns
// the number of new purchases that resulted, i.e., the number
// of invoices that contributed actual money.
export default async function syncPaidInvoices(
  account_id: string
): Promise<number> {
  const invoices = await getPaidInvoices(
    account_id,
    10,
    dayjs().subtract(1, "day").toDate()
  );
  logger.debug(
    "syncPaidInvoices: considering ",
    invoices.length,
    "paid invoices"
  );
  let num = 0;
  for (const invoice of invoices) {
    // this only adds invoices for credit's, and checks that
    // the invoice_id is unique.
    if (await createCreditFromPaidStripeInvoice(invoice)) {
      num += 1;
    }
  }
  return num;
}
