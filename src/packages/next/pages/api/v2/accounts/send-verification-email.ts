/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Send verification email
*/

import sendEmailVerification from "@cocalc/server/accounts/send-email-verification";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }
  const { email_address } = getParams(req);
  try {
    const msg = await sendEmailVerification(account_id, email_address);
    res.json({ error: msg });
  } catch (err) {
    res.json({ error: err.message });
  }
}
