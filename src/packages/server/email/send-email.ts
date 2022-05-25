/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Send email using whichever email_backend is configured in the database,
or throw an exception if none is properly configured.
*/

import type { Message } from "./message";
import sendViaSMTP from "./smtp";
import sendViaSendgrid from "./sendgrid";
import sendEmailThrottle from "./throttle";
import { getServerSettings } from "../settings/server-settings";

export default async function sendEmail(
  message: Message,
  account_id?: string // account that we are sending this email *on behalf of*, if any (used for throttling).
): Promise<void> {
  await sendEmailThrottle(account_id);

  const { email_backend } = await getServerSettings();
  switch (email_backend) {
    case "":
    case "none":
      return;
    case "smtp":
      return await sendViaSMTP(message);
    case "sendgrid":
      return await sendViaSendgrid(message);
    default:
      throw Error(
        `no valid email backend configured: ${email_backend}`
      );
  }
}
