/*
Let user get all of their purchase quotas.
*/

import getAccountId from "lib/account/get-account";
import { getPurchaseQuotas, PurchaseQuotas } from "@cocalc/server/purchases/purchase-quotas";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) : Promise<PurchaseQuotas> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  return await getPurchaseQuotas(account_id);
}
