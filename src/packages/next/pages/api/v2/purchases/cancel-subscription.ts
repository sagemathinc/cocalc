/*
Cancel a subscription.

- now: if true, cancels license now and provides a refund.  Otherwise, cancels at period end.
*/

import getAccountId from "lib/account/get-account";
import cancelSubscription from "@cocalc/server/purchases/cancel-subscription";
import getParams from "lib/api/get-params";
import { OkStatus } from "lib/api/status";

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
  const { subscription_id, reason } = getParams(req);
  await cancelSubscription({
    account_id,
    subscription_id,
    reason,
  });
  return OkStatus;
}
