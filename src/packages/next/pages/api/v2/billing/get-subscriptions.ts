/*
Get subscriptions for the signed in user.
*/

import getSubscriptions from "@cocalc/server/billing/get-subscriptions";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<object> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  // these are defined at https://stripe.com/docs/api/pagination
  // limit is between 1 and 100
  // starting_after and ending_before are object id's
  const { limit, starting_after, ending_before } = getParams(req);
  return await getSubscriptions(account_id, {
    limit,
    starting_after,
    ending_before,
  });
}
