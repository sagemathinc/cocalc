/*
Get minimum allowed balance for this user.  This is usually 0.
*/

import getAccountId from "lib/account/get-account";
import getMinBalance from "@cocalc/server/purchases/get-min-balance";

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
    throw Error("must be signed in");
  }
  return await getMinBalance(account_id);
}
