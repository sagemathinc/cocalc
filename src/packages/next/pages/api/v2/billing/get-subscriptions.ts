/*
Get subscriptions for the signed in user.
*/

import getSubscriptions from "@cocalc/server/billing/get-subscriptions";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<object[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  return await getSubscriptions(account_id);
}
