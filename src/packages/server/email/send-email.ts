/*
Send email using whichever email_backend is configured in the database,
or throw an exception if none is properly configured.
*/

import type { Message } from "./message";
import getPool from "@cocalc/backend/database";
import sendViaSMTP from "./smtp";
import sendViaSendgrid from "./sendgrid";
import sendEmailThrottle from "./throttle";

export default async function sendEmail(
  message: Message,
  account_id?: string // account that we are sending this email *on behalf of*, if any (used for throttling).
): Promise<void> {
  const pool = getPool("long");
  await sendEmailThrottle(account_id);
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='email_backend'"
  );
  if (rows.length == 0) {
    throw Error("no email backend is configured");
  }
  const { value } = rows[0];
  if (value == "smtp") {
    await sendViaSMTP(message);
  } else if (value == "sendgrid") {
    await sendViaSendgrid(message);
  } else {
    throw Error("no valid email backend configured");
  }
}
