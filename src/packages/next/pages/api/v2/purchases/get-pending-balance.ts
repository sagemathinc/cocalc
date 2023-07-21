/*
Get total amount of pending transactions owed right now.  These
are ONLY the pending transactions and nothing else.
*/

import getAccountId from "lib/account/get-account";
import { getPendingBalance } from "@cocalc/server/purchases/get-balance";

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
  return await getPendingBalance(account_id);
}
