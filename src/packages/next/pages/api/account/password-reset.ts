/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Password reset works as follows:

1. Query the database to make sure there is a user with the given email address.
2. If a password reset was already sent within the last XX minutes,
   return an error -- we don't want people to spam other people with
   password resets.
3. Generate password reset token and write to database.
4. Send email.
5. Send response to user that email has been sent (or there was an error).
*/

import isAccountAvailable from "@cocalc/util-node/auth/is-account-available";
import {
  recentAttempts,
  createReset,
} from "@cocalc/util-node/auth/password-reset";

export default async function passwordReset(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "Sign In must use a POST request." });
    return;
  }

  const { email } = req.body;

  if (await isAccountAvailable(email)) {
    // Bad -- email is *available*, which means no way to reset
    // the password for it, since it doesn't exist.
    res.json({ error: `There is no account with email "${email}".` });
    return;
  }
  // Check that user isn't spamming email.

  const n = await recentAttempts(email, req.ip);
  if (n > 1) {
    res.json({
      error: `We recently sent a password reset for "${email}" (n=${n}).  Please check your email or wait a while and try later.`,
    });
    return;
  }

  const id = await createReset(email, req.ip, 60 * 60 * 4); // 4 hour ttl seems reasonable for this.

  // TODO:
  // - Send email with the id and link
  // - Link should be back to next.js server (i.e., a new password reset target)
  // - Implement that target and backend handling of it.

  res.json({
    success: `Password reset email successfully sent to ${email}.`,
  });
  return;
}
