/*
Add item to the shopping cart for signed in user.

request body:

- product and description: to add something new to the cart
or
- id: to move something back into the cart that was removed
*/

import addToCart, { putBackInCart } from "@cocalc/server/shopping/cart/add";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await add(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function add(req): Promise<number | undefined> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to use shopping cart");
  }
  const { product, description, id } = req.body;
  if (id != null) {
    // adding something back
    return await putBackInCart(account_id, id);
  }
  if (!product) {
    throw Error("if id isn't specified then the product must be set");
  }
  return await addToCart(account_id, product, description);
}
