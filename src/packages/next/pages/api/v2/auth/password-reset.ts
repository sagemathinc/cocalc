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

import isAccountAvailable from "@cocalc/server/auth/is-account-available";
import {
  recentAttempts,
  createReset,
} from "@cocalc/server/auth/password-reset";
import sendPasswordResetEmail from "@cocalc/server/email/password-reset";

export default async function passwordReset(req, res) {
  if (req.method !== "POST") {
    res
      .status(404)
      .json({ message: "password reset must use a POST request." });
    return;
  }

  const { email } = req.body;
  const result = await handle(email, req.ip);
  res.json(result);
}

async function handle(email: string, ip: string): Promise<object> {
  if (await isAccountAvailable(email)) {
    // Bad -- email is *available*, which means no way to reset
    // the password for it, since it doesn't exist.
    return { error: `There is no account with email "${email}".` };
  }
  // Check that user isn't spamming email.

  const n = await recentAttempts(email, ip);
  if (n > 1) {
    return {
      error: `We recently sent multiple password resets for "${email}".  Check your email or wait a while and try later.`,
    };
  }

  const id = await createReset(email, ip, 60 * 60 * 4); // 4 hour ttl seems reasonable for this.
  // TODO:
  // - Send email with the id and link
  // - Link should be back to next.js server (i.e., a new password reset target)
  // - Implement that target and backend handling of it.
  try {
    await sendPasswordResetEmail(email, id);
  } catch (err) {
    return {
      error: `Sending password reset email failed -- ${err}`,
    };
  }

  return {
    success: `Password reset email successfully sent to ${email}.`,
  };
}
