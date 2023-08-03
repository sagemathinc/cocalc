/*
Get spend rate right now of this user.
*/

import getAccountId from "lib/account/get-account";
import getSpendRate from "@cocalc/server/purchases/get-spend-rate";

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
  return await getSpendRate(account_id);
}
