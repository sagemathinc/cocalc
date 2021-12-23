/*
Get invoices and receipts for the given user.
*/

import getInvoicesAndReceipts from "@cocalc/server/billing/get-invoices-and-receipts";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
}

async function get(req): Promise<object[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  return await getInvoicesAndReceipts(account_id);
}
