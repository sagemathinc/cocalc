/* Send a password reset email */

import siteURL from "@cocalc/server/settings/site-url";
import sendViaSMTP from "./smtp";
import sendViaSendgrid from "./sendgrid";
import { getServerSettings } from "@cocalc/server/settings";

export default async function sendPasswordResetEmail(
  email_address: string, // target email_address of user who will receive the password reset email
  id: string // the secret code that they must supply to reset their password
): Promise<void> {
  const subject = "Password Reset";
  const { html, text } = await getMessage(email_address, id);
  const message = { to: email_address, subject, html, text };
  try {
    await sendViaSMTP(message, "password_reset");
  } catch (err) {
    console.log(
      "sending password reset via secondary smtp server failed; trying sendgrid.",
      err
    );
    await sendViaSendgrid(message);
  }
}

async function getMessage(
  email_address: string,
  id: string
): Promise<{ html: string; text: string }> {
  const { help_email, site_name } = await getServerSettings();
  const site_url = await siteURL();
  const reset_url = `${site_url}/auth/password-reset/${id}`;

  let html = `
<div>
Hello,
<br/>
<br/>
Somebody just requested to change the password of your ${
    site_name ?? "OpenCoCalc"
  } account with email address <b>${email_address}</b>.
If you requested this password change, please click this link:
<div style="text-align: center; font-size: 120%; margin:30px 0">
  <b><a href="${reset_url}">${reset_url}</a></b>
</div>
<br/>
If you don't want to change your password, ignore this message.
`;
  if (help_email) {
    html += `
<br/>
<br/>
In case of problems, email
<a href="mailto:${help_email}">${help_email}</a>.
`;
  }

  let text = `
Hello,

Somebody just requested to change the password of your
${site_name ?? "OpenCoCalc"} account with email address ${email_address}.

If you requested this password change, visit this URL:

    ${reset_url}

If you don't want to change your password, ignore this message.
`;
  if (help_email) {
    text += `\n\nIn case of problems, email ${help_email}.\n`;
  }

  return { html, text };
}
