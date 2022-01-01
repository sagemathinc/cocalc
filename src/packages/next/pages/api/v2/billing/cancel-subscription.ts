/*
Cancel a subscription for a signed in customer.
*/

import cancelSubscription from "@cocalc/server/billing/cancel-subscription";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
  try {
    res.json(await cancel(req));
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
}

async function cancel(req): Promise<{ success: true }> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to set stripe default card");
  }
  const { id } = req.body;
  if (!id) {
    throw Error("id of subscription method must be specified");
  }
  await cancelSubscription(account_id, id);
  return { success: true };
}
