/*
Get shopping cart for signed in user.  Can also optionally get everything
ever removed from cart, and also everything ever purchased.
*/

import getCart, { Item } from "@cocalc/server/shopping/cart/get";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<Item[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to get shopping cart information");
  }
  const { purchased, removed } = req.body;
  return await getCart({ account_id, purchased, removed });
}
