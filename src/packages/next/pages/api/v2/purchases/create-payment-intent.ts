/*
 */

import getAccountId from "lib/account/get-account";
import createPaymentIntent from "@cocalc/server/purchases//create-payment-intent";
import getParams from "lib/api/get-params";
import type { PaymentIntentSecret } from "@cocalc/util/stripe/types";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<PaymentIntentSecret> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { amount, description, purpose } = getParams(req);
  return await createPaymentIntent({
    account_id,
    amount,
    description,
    purpose,
  });
}
