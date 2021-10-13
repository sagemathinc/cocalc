/* We use the official V3 Sendgrid API:

https://www.npmjs.com/package/@sendgrid/mail
*/

import getPool from "@cocalc/backend/database";
import sgMail from "@sendgrid/mail";
import type { Message } from "./message";
import getHelpEmail from "./help";

// Init throws error if we can't initialize Sendgrid right now.
// It also updates the key if it changes in at most one minute (?).
let initialized = 0;
export async function getSendgrid(): Promise<any> {
  const now = new Date().valueOf();
  if (now - initialized < 1000 * 30) {
    // initialized recently
    return sgMail;
  }
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='sendgrid_key'"
  );
  if (rows.length == 0 || !rows[0].value) {
    if (initialized) {
      // no key now, but there was a key before -- so clear it and error
      sgMail.setApiKey("");
      throw Error("no sendgrid key");
    }
  }
  sgMail.setApiKey(rows[0].value);
  initialized = new Date().valueOf();
  return sgMail;
}

export default async function sendEmail(message: Message): Promise<void> {
  const sg = await getSendgrid();
  if (!message.from) {
    message.from = await getHelpEmail(); // fallback
  }
  await sg.send(message);
}
