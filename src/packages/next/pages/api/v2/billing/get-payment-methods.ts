/*
Get payment methods for the signed in user.
*/

import getPaymentMethods from "@cocalc/server/billing/get-payment-methods";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
}

async function get(req): Promise<object[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  return await getPaymentMethods(account_id);
}
