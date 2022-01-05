/*
Permanently delete item from signed in user's shopping cart.
These are *gone forever*.

Returns the number of items actually deleted (0 or 1).
*/

import deleteFromCart from "@cocalc/server/shopping/cart/delete";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await del(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function del(req): Promise<number> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to get shopping cart information");
  }
  const { id } = req.body;
  return await deleteFromCart(account_id, id);
}
