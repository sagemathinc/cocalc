/*
Set password for an existing account.
*/

import setPassword from "@cocalc/server/accounts/set-password";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }
  const { currentPassword, newPassword } = req.body;
  try {
    await setPassword(account_id, currentPassword, newPassword);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
