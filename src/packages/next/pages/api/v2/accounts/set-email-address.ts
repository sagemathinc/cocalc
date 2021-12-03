/*
Set email address for an existing account.
*/

import setEmailAddress from "@cocalc/server/accounts/set-email-address";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }
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
