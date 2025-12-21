/*
Resolve effective membership for the current account.
*/

import getAccountId from "lib/account/get-account";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";

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
  return await resolveMembershipForAccount(account_id);
}
