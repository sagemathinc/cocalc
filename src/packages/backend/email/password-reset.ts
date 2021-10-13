/* Send a password reset email */

import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import getPool from "@cocalc/backend/database";
import getFooter from "./footer";

export default async function sendPasswordResetEmail(
  email_address: string, // target user who will receive the password reset email
  id: string // the secret code that they must supply to reset their password
): Promise<void> {
  let settings: Settings;
  try {
    settings = await getSettings();
  } catch (err) {
    throw Error(
      `Password reset is not fully configured for this server. Contact the site administrator. -- ${err}`
    );
  }
  const from = `${settings.site_name ?? "CoCalc"} <${
    settings.password_reset_smtp_from
  }>`;
  const server = await getServer(settings);
  const subject = `${settings.site_name ?? "CoCalc"} Password Reset`;
  const { html, text } = getMessage(settings, email_address, id);
  server.sendMail({
    from,
    replyTo: from,
    to: email_address,
    subject,
    html,
    text,
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
    secure:
      !settings.password_reset_smtp_port ||
      settings.password_reset_smtp_port == 465, // true for 465, false for other ports
    auth: {
      user: settings.password_reset_smtp_login,
      pass: settings.password_reset_smtp_password,
    },
  });
  cacheSettings = s;
  return server;
}

interface Settings {
  password_reset_smtp_server: string;
  password_reset_smtp_login: string;
  password_reset_smtp_password: string;
  password_reset_smtp_from: string;
  password_reset_smtp_port?: string;
  dns: string;
  site_name: string;
  help_email: string;
  company_name: string;
}

async function getSettings(): Promise<Settings> {
  const pool = getPool("long"); // rarely changes
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name LIKE 'password_reset_%' OR name='site_name' OR name='dns' OR name='help_email' OR name='company_name'"
  );
  const settings: Partial<Settings> = {};
  for (const row of rows) {
    settings[row.name] = row.value;
  }
  if (!settings.password_reset_smtp_server) {
    throw Error("Secondary SMTP server must be configured");
  }
  if (!settings.password_reset_smtp_login) {
    throw Error("Secondary SMTP username must be configured");
  }
  if (!settings.password_reset_smtp_password) {
    throw Error("Secondary SMTP password must be configured");
  }
  if (!settings.password_reset_smtp_from) {
    throw Error("Secondary SMTP from must be configured");
  }
  if (!settings.dns) {
    throw Error("Domain name must be configured");
  }
  if (!settings.site_name) {
    settings.site_name = "Open CoCalc";
  }
  if (!settings.help_email) {
    settings.help_email = settings.password_reset_smtp_from;
  }
  if (!settings.company_name) {
    settings.company_name = "Open CoCalc";
  }

  return settings as Settings;
}

function getMessage(
  settings,
  email_address: string,
  id: string
): { html: string; text: string } {
  const site_url = `https://${settings.dns}`;
  const reset_url = `${site_url}/auth/password-reset/${id}`;
  const footer = getFooter({ ...settings, site_url });

  let html = `
<div>
Hello,
<br/>
<br/>
Somebody just requested to change the password of your ${
    settings.site_name ?? "OpenCoCalc"
  } account with email address <b>${email_address}</b>.
If you requested this password change, please click this link:
<div style="text-align: center; font-size: 120%; margin:30px 0">
  <b><a href="${reset_url}">${reset_url}</a></b>
</div>
<br/>
If you don't want to change your password, ignore this message.
`;
  if (settings.help_email) {
    html += `
<br/>
<br/>
In case of problems, email
<a href="mailto:${settings.help_email}">${settings.help_email}</a>.
`;
  }
  html += footer.html;

  let text = `
Hello,

Somebody just requested to change the password of your
${
  settings.site_name ?? "OpenCoCalc"
} account with email address ${email_address}.

If you requested this password change, visit this URL:

    ${reset_url}

If you don't want to change your password, ignore this message.
`;
  if (settings.help_email) {
    text += `\n\nIn case of problems, email ${settings.help_email}.\n`;
  }

  text += footer.text;

  return { html, text };
}
