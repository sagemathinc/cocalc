/*
Let user get all of their purchase quotas.
*/

import getAccountId from "lib/account/get-account";
import syncPaidInvoices from "@cocalc/server/purchases/sync-paid-invoices";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<PurchaseQuotas> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  await syncPaidInvoices(account_id);
  return { status: "ok" };
}
