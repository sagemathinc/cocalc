/*
Set password for an existing account.
*/

import setPassword from "@cocalc/server/accounts/set-password";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }
  const { currentPassword, newPassword } = getParams(req);
  try {
    await setPassword(account_id, currentPassword, newPassword);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
