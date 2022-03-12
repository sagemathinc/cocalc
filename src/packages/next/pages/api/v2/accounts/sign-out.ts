/*
Sign out of the current session or all sessions.

This invalidates 1 or more remember me cookies for
the account that is making the API request.
*/

import getAccountId, { getRememberMeHash } from "lib/account/get-account";
import {
  deleteRememberMe,
  deleteAllRememberMe,
} from "@cocalc/server/auth/remember-me";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  try {
    await signOut(req);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function signOut(req): Promise<void> {
  const { all } = req.body;
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
