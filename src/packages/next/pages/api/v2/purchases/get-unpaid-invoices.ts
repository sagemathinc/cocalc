/*
Get all unpaid invoices
*/

import getAccountId from "lib/account/get-account";
import getUnpaidInvoices from "@cocalc/server/purchases/get-unpaid-invoices";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  return await getUnpaidInvoices(account_id);
}
