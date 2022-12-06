/*
Sign out of the current session or all sessions.

This invalidates 1 or more remember me cookies for
the account that is making the API request.
*/

import getAccountId from "lib/account/get-account";
import { getRememberMeHash } from "@cocalc/server/auth/remember-me";
import {
  deleteRememberMe,
  deleteAllRememberMe,
} from "@cocalc/server/auth/remember-me";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    await signOut(req);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function signOut(req): Promise<void> {
  const { all } = getParams(req);
  if (all) {
    // invalidate all remember me cookies for this account.
    const account_id = await getAccountId(req);
    if (!account_id) return; // not signed in
    await deleteAllRememberMe(account_id);
  } else {
    const hash = getRememberMeHash(req);
    if (!hash) return; // not signed in
    await deleteRememberMe(hash);
  }
}
