/*
Let user set one of their purchase quotas.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { setPurchaseQuota } from "@cocalc/server/purchases/purchase-quotas";

export default async function handle(req, res) {
  try {
    await get(req);
    res.json({ status: "ok" });
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
  const { name, value } = getParams(req);
  await setPurchaseQuota({ account_id, name, value: parseInt(value) });
}
