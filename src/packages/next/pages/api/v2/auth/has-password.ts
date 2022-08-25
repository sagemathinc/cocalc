/* API endpoint to determine whether or not the currently authenticated
user has a passport. */

import getAccountId from "lib/account/get-account";
import hasPassword from "@cocalc/server/auth/has-password";

export default async function handle(req, res) {
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
