/*
Creates a stripe checkout session that when paid, credits the user's account.

This is used to reduce the user's balance so they are allowed to make purchases.
*/

import getAccountId from "lib/account/get-account";
import createStripeCheckoutSession from "@cocalc/server/purchases/create-stripe-checkout-session";
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
  const {
    amount,
    description = "Payment to Credit Your Account",
    success_url,
    cancel_url,
  } = getParams(req);
  return await createStripeCheckoutSession({
    account_id,
    amount,
    description,
    success_url,
    cancel_url,
  });
}
