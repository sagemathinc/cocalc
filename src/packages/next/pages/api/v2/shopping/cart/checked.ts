/*
Check or uncheck item in cart.
*/

import setChecked from "@cocalc/server/shopping/cart/checked";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function set(req): Promise<number> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to get shopping cart information");
  }
  const { id, checked } = getParams(req);
  return await setChecked(account_id, checked, id);
}
