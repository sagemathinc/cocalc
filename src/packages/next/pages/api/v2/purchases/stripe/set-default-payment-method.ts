/*
Set default payment method for signed in customer.
*/

import setDefaultPaymentMethod from "@cocalc/server/purchases/stripe/set-default-payment-method";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function set(req): Promise<{ success: true }> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to set stripe default payment method");
  }
  throttle({ account_id, endpoint: "purchases/stripe/set-default-payment-method" });
  const { default_payment_method } = getParams(req);
  if (!default_payment_method) {
    throw Error("must specify the default source");
  }
  await setDefaultPaymentMethod({ account_id, default_payment_method });
  return { success: true };
}
