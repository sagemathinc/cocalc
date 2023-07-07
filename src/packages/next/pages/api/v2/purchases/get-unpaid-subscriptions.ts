/*
List of all unpaid subscriptions [{id:number;cost:number;status:'unpaid'|'past_due'}, ...]
*/

import getAccountId from "lib/account/get-account";
import getUnpaidSubscriptions from "@cocalc/server/purchases/get-unpaid-subscriptions";
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
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { limit, offset } = getParams(req);
  return await getUnpaidSubscriptions(account_id);
}
