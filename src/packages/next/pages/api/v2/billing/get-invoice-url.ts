/*
Get specific invoice's hosted URL, given that you know the invoice id.

LEGACY: Also works for receipt of payment intent.
*/
import { getInvoiceUrl } from "@cocalc/server/billing/get-invoices-and-receipts";
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
    // doesn't matter what id is -- just that signed in...
    throw Error("must be signed in");
  }
  const { invoice_id } = getParams(req);
  return { url: await getInvoiceUrl(invoice_id) };
}
