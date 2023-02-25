/*
Get the *public* profile for a given account or the private profile of the
user making the request.

This is public information if user the user knows the account_id. It is the
color, the name, and the image.
*/

import getProfile from "@cocalc/server/accounts/profile/get";
import getPrivateProfile from "@cocalc/server/accounts/profile/private";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const { account_id, noCache } = getParams(req);
  try {
    if (account_id == null) {
      res.json({ profile: await getPrivate(req, noCache) });
    } else {
      res.json({ profile: await getProfile(account_id, noCache) });
    }
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function getPrivate(req, noCache) {
  const account_id = await getAccountId(req, noCache);
  if (account_id == null) {
    return {};
  }
  return await getPrivateProfile(account_id, noCache);
}
