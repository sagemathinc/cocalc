/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Send a password reset email */

import { sendTemplateEmail } from "./smtp";

export default async function sendPasswordResetEmail(
  email_address: string, // target email_address of user who will receive the password reset email
  id: string // the secret code that they must supply to reset their password
) {
  return await sendTemplateEmail({
    priority: 10, // high
    subject: "Password Reset",
    template: "password_reset",
    to: email_address,
    locals: {
      token: id,
    },
  });
}
