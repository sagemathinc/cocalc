/*
Delete the account that the user is currently signed in using.
*/

import getAccountId from "lib/account/get-account";
import deleteAccount from "@cocalc/server/accounts/delete";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    await deleteAccount(account_id);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
