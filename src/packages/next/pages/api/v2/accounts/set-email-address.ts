/*
Set email address for an existing account.

You must include both the email address and password.  If there is no password
currently set for the account, you have to set one as part of this request.
*/

import setEmailAddress from "@cocalc/server/accounts/set-email-address";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }
  const { email_address, password } = req.body;
  try {
    await setEmailAddress(account_id, email_address, password);
    res.json({});
  } catch (err) {
    if (err.message.includes("duplicate key")) {
      err = Error(
        `The email address "${email_address}" is already in use by another account.`
      );
    }
    res.json({ error: err.message });
  }
}
