/*
An admin can cancel anybody's payment intent, whereas a user can only cancel their own.
*/

import getAccountId from "lib/account/get-account";
import {
  cancelPaymentIntent,
  getPaymentIntentAccountId,
} from "@cocalc/server/purchases/stripe/create-payment-intent";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import throttle from "@cocalc/util/api/throttle";

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
  throttle({
    account_id,
    endpoint: "purchases/stripe/cancel-payment-intent",
  });
  const { id, reason } = getParams(req);
  const owner_id = await getPaymentIntentAccountId(id);
  if (owner_id != account_id) {
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can cancel other user's payment intents");
    }
  }
  await cancelPaymentIntent({ id, reason });
  return { success: true };
}
