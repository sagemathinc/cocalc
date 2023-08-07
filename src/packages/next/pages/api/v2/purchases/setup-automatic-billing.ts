/*
Creates a stripe checkout session that sets up automatic billing via a stripe usage-based subscription.

This is mainly used to *increase* the user's balance periodically so that their subscriptions will
get automatically paid.  Also, if they are allowed to let their balance go below 0, this periodically
tops it back up to 0.
*/

import getAccountId from "lib/account/get-account";
import { createStripeUsageBasedSubscription } from "@cocalc/server/purchases/stripe-usage-based-subscription";
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
  const { success_url, cancel_url } = getParams(req);
  return await createStripeUsageBasedSubscription({
    account_id,
    success_url,
    cancel_url,
  });
}
