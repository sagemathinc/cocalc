/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Send email using whichever email_backend is configured in the database,
or throw an exception if none is properly configured.
*/

import { getServerSettings } from "../settings/server-settings";
import type { Message } from "./message";
import sendViaSMTP from "./smtp";
import sendEmailThrottle from "./throttle";
import { EmailTemplateName } from "./types";

interface SendEmailOpts {
  message: Message;
  id?: string; // account or project ID that we are sending this email *on behalf of*, if any (used for throttling).
  channel?: EmailTemplateName;
}

export default async function sendEmail({
  message,
  id,
}: SendEmailOpts): Promise<void> {
  await sendEmailThrottle(id, message.channel);

  const { email_backend } = await getServerSettings();
  switch (email_backend) {
    case "":
    case "none":
      throw Error(`no email backend configured`);
    case "smtp":
      return await sendViaSMTP(message);
    default:
      throw Error(`no valid email backend configured: ${email_backend}`);
  }
}
