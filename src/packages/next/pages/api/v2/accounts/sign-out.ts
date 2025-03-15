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
import { apiRoute, apiRouteOperation } from "lib/api";
import { SuccessStatus } from "lib/api/status";
import {
  AccountSignOutInputSchema,
  AccountSignOutOutputSchema,
} from "lib/api/schema/accounts/sign-out";
import {
  ACCOUNT_ID_COOKIE_NAME,
  REMEMBER_ME_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";

async function handle(req, res) {
  try {
    await signOut(req, res);
    res.json(SuccessStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function signOut(req, res): Promise<void> {
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
  // also delete any security relevant cookies for safety and to avoid confusion.
  res.clearCookie(REMEMBER_ME_COOKIE_NAME);
  res.clearCookie(ACCOUNT_ID_COOKIE_NAME);
}

export default apiRoute({
  signOut: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts"],
    },
  })
    .input({
      contentType: "application/json",
      body: AccountSignOutInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: AccountSignOutOutputSchema,
      },
    ])
    .handler(handle),
});
