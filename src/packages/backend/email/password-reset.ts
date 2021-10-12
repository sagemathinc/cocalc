/* Send a password reset email */

import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import getPool from "@cocalc/backend/database";

export default async function sendPasswordResetEmail(
  email_address: string, // target user who will receive the password reset email
  id: string // the secret code that they must supply to reset their password
): Promise<void> {
  const settings = await getSettings();
  if (
    !settings.password_reset_smtp_server ||
    !settings.password_reset_smtp_login ||
    !settings.password_reset_smtp_password ||
    !settings.dns
  ) {
    throw Error(
      "Password reset is not fully configured for this server. Contact the site administrator."
    );
  }
  const server = await getServer(settings);
  const subject = `${settings.site_name ?? "CoCalc"} Password Reset`;
  const html = getBody(settings, email_address, id);
  server.sendMail({
    from: settings.password_reset_smtp_from,
    replyTo: settings.password_reset_smtp_from,
    to: email_address,
    subject,
    html,
  });
}

let server: undefined | Transporter = undefined;
let cacheSettings = ""; // what settings were used to compute cached server.
async function getServer(settings): Promise<Transporter> {
  const s = JSON.stringify(settings);
  if (server !== undefined && s == cacheSettings) return server;
  server = await createTransport({
    host: settings.password_reset_smtp_server,
    port: settings.password_reset_smtp_port,
    secure: settings.password_reset_smtp_secure, // true for 465, false for other ports
    auth: {
      user: settings.password_reset_smtp_login,
      pass: settings.password_reset_smtp_password,
    },
  });
  cacheSettings = s;
  return server;
}

async function getSettings(): Promise<{ [setting: string]: any }> {
  const pool = getPool("long"); // rarely changes
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name LIKE 'password_reset_%' OR name='site_name' OR name='dns' OR name='help_email'"
  );
  const settings: any = {};
  for (const row of rows) {
    settings[row.name] = row.value;
  }
  return settings;
}

function getBody(settings, email_address: string, id: string): string {
  const url = `https://${settings.dns}/auth/password-reset/${id}`;
  let body = `
<div>
Hello,
<br/>
<br/>
Somebody just requested to change the password of your ${
    settings.site_name ?? "OpenCoCalc"
  } account with email address <b>${email_address}</b>.
If you requested this password change, please click this link:
<div style="text-align: center; font-size: 120%; margin:30px 0">
  <b><a href="https://${url}">${url}</a></b>
</div>
<br/>
If you don't want to change your password, ignore this message.
`;
  if (settings.help_email) {
    body += `
<br/>
In case of problems, email
<a href="mailto:${settings.help_email}">${settings.help_email}</a> immediately!
`;
  }
  return body;
}
