/*
List of all live subscriptions [{id:number;cost:number;status:'unpaid'|'past_due'|'active'}, ...]
*/

import getAccountId from "lib/account/get-account";
import getLiveSubscriptions from "@cocalc/server/purchases/get-live-subscriptions";

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
  return await getLiveSubscriptions(account_id);
}
