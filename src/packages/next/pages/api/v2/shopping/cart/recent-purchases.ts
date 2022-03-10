/*
Get recent purchases.
*/

import { Item } from "@cocalc/server/shopping/cart/get";
import getRecentPurchases from "@cocalc/server/shopping/cart/recent-purchases";
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
  // recent = postgresql time, e.g., "1 day".  Can be omitted, in which case default is "1 week".
  const { recent } = req.body;
  return await getRecentPurchases({ account_id, recent });
}
