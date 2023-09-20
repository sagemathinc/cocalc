/*
Renew one of your subscriptions.  Returns {purchase_id:number|nill} for the purchase of the next interval of the subscription.
Null if nothing needed to be done.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import renewSubscription from "@cocalc/server/purchases/renew-subscription";

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
  return {
    purchase_id: await renewSubscription({
      account_id,
      subscription_id,
    }),
  };
}
