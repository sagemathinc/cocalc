/*
Let user set one of their purchase quotas.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import {
  setPurchaseQuota,
  getPurchaseQuotas,
} from "@cocalc/server/purchases/purchase-quotas";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<void> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { service, value } = getParams(req);
  await setPurchaseQuota({ account_id, service, value: parseFloat(value) });
  // it worked, so we return the new quotas
  return await getPurchaseQuotas(account_id);
}
