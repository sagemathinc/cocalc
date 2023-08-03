/*
Get specific invoice, given that you know the invoice id.
We do NOT make any requirement that you are the user that
created the invoice.  The invoice id's seem pretty long and
random, so this should be OK.
*/
import { getInvoice } from "@cocalc/server/billing/get-invoices-and-receipts";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<object> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { invoice_id } = getParams(req);
  return await getInvoice(invoice_id);
}
