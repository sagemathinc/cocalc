/*
Get items that are currently being processed.
*/

import getProcessing from "@cocalc/server/shopping/cart/processing";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to get cart checkout items");
  }
  return await getProcessing({ account_id });
}
