/*
Edit item in the shopping cart.
*/

import editCart from "@cocalc/server/shopping/cart/edit";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await edit(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function edit(req): Promise<number> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to use shopping cart");
  }
  const { product, description, id } = getParams(req);
  return await editCart({ account_id, product, description, id });
}
