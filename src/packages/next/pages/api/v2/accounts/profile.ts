/*
Get the profile for an account.
This is public information if user the user knows
the account_id.  It is the color, the name, and
the image.
*/

import getProfile from "@cocalc/server/accounts/profile/get";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const { account_id } = req.body;
  try {
    res.json({ profile: await getProfile(account_id) });
  } catch (err) {
    res.json({ error: `${err}` });
  }
}
