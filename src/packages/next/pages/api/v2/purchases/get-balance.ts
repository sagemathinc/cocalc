/*
Get balance right now.
As a side effect, it updates the balance field of the accounts table.
*/

import getAccountId from "lib/account/get-account";
import getBalance from "@cocalc/server/purchases/get-balance";

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
  return await getBalance({ account_id });
}
