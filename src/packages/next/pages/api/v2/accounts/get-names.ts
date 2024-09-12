/*
Get first and last name for a list of account_id's.

The output is an object {names:{[account_id]:{first_name:string;last_name:string}}},
where the value for a given account_id is not given if that account does not
exist or was deleted (instead of an error).

There is about 30s of caching if you call this with the same input twice.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { getNames } from "@cocalc/server/accounts/get-name";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }

  let { account_ids } = getParams(req);

  try {
    const names = await getNames(account_ids);
    res.json({ names });
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
