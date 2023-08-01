/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Send email verification */

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "../settings";
import { sendTemplateEmail } from "./smtp";

const L = getLogger("email:send-templates");

export async function sendVerifyEmail(
  email_address: string, // target email_address of user who will receive the password reset email
  token: string
) {
  const { verify_emails = true } = await getServerSettings();

  if (!verify_emails) {
    L.info("verify_emails is disabled, so not sending verification email");
    return;
  }

  const token_query = encodeURI(
    `email=${encodeURIComponent(email_address)}&token=${token}`
  );
  const token_url = `"/auth/verify?${token_query}`;

  return await sendTemplateEmail({
    priority: 5, // high
    subject: "Verify Email Address",
    template: "verify_email",
    to: email_address,
    locals: { token_url },
  });
}
