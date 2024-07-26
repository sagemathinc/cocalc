/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Send email using whichever email_backend is configured in the database,
or throw an exception if none is properly configured.
*/

import type { Message } from "./message";
import sendViaSMTP from "./smtp";
import sendViaSendgrid from "./sendgrid";
import sendEmailThrottle from "./throttle";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

export const testEmails: Message[] = [];
export function resetTestEmails() {
  testEmails.length = 0;
}

export default async function sendEmail(
  message: Message,
  account_id?: string, // account that we are sending this email *on behalf of*, if any (used for throttling).
): Promise<void> {
  if (process.env.COCALC_TEST_MODE) {
    // In testing mode, we just push emails into a list. The test framework can then check to see
    // what happened.
    testEmails.push(message);
    return;
  }

  await sendEmailThrottle(account_id);

  const { email_backend } = await getServerSettings();
  switch (email_backend) {
    case "":
    case "none":
      throw Error(`no email backend configured`);
    case "smtp":
      return await sendViaSMTP(message);
    case "sendgrid":
      return await sendViaSendgrid(message);
    default:
      throw Error(`no valid email backend configured: ${email_backend}`);
  }
}

export async function isEmailConfigured() {
  const { email_backend } = await getServerSettings();
  if (!email_backend || email_backend == "none") {
    return false;
  } else {
    return true;
  }
}
