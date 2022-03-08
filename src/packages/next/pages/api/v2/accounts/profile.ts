/*
Get the *public* profile for an account.

This is public information if user the user knows
the account_id.  It is the color, the name, and
the image.
*/

import getProfile from "@cocalc/server/accounts/profile/get";
import getPrivateProfile from "@cocalc/server/accounts/profile/private";
import isPost from "lib/api/is-post";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const { account_id, noCache } = req.body;
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
