/*
Let admin get the global quota (and explanation) for another user.
*/

import getAccountId from "lib/account/get-account";
import { adminGetQuota } from "@cocalc/server/purchases/get-quota";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const admin_id = await getAccountId(req);
  if (admin_id == null) {
    throw Error("must be signed in");
  }
  const { account_id } = getParams(req);
  if (account_id == null) {
    throw Error("must specify account_id");
  }
  return await adminGetQuota({ admin_id, account_id });
}
