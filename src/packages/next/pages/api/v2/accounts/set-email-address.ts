/*
Set email address for an existing account.
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
    res.json({ error: err.message });
  }
}
