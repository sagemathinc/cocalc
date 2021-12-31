/*
Get customer object for the signed in user.  Error if user not signed in.
*/

import getCustomer from "@cocalc/server/billing/get-customer";
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
    throw Error("must be signed in to get stripe customer information");
  }
  return await getCustomer(account_id);
}
