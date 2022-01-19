/*
Get shopping cart for signed in user.  Can also optionally get everything
ever removed from cart, and also everything ever purchased.
*/

import checkout from "@cocalc/server/shopping/cart/checkout";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    await doIt(req);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to check out");
  }
  return await checkout(account_id);
}
