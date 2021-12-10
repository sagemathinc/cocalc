/* API endpoint to determine whether or not the currently authenticated
user has a passport. */

import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";
import hasPassword from "@cocalc/server/auth/has-password";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    res.json({ hasPassword: await hasPassword(account_id) });
  } catch (err) {
    res.json({ error: err.message });
  }
}
