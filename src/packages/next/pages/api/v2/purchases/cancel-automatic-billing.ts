/*
Cancels any configured automatic billing subscription.
*/

import getAccountId from "lib/account/get-account";
import { cancelUsageSubscription } from "@cocalc/server/purchases/stripe-usage-based-subscription";
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
  await cancelUsageSubscription(account_id);
  return { success: true };
}
