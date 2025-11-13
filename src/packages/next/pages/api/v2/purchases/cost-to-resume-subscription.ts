/*
Cost to renew one of your subscriptions right now for the next period. Returns {cost:...}.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { costToResumeSubscription } from "@cocalc/server/purchases/resume-subscription";

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
  const { subscription_id } = getParams(req);
  return await costToResumeSubscription(subscription_id);
}
