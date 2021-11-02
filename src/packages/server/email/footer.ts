import { getServerSettings } from "@cocalc/backend/server-settings";
import type { Message } from "./message";
import siteURL from "@cocalc/backend/server-settings/site-url";

export async function getFooter(): Promise<{
  html: string;
  text: string;
}> {
  let { help_email, site_name, organization_name, organization_url } =
    await getServerSettings();

  // Make sure everything is defined somehow...
  if (!help_email) {
    help_email = "help@cocalc.com";
  }
  if (!site_name) {
    site_name = "OpenCoCalc";
  }
  if (!organization_name) {
    organization_name = "Hosted CoCalc";
  }
  if (!organization_url) {
    try {
      organization_url = await siteURL();
    } catch (_) {
      organization_url = "https://example.com";
    }
  }

  const html = `
<p style="margin-top:100px; padding-top:15px; border-top: 1px solid gray; color: gray; font-size:85%; text-align:center">
This email was sent from <a href="${organization_url}">${site_name}</a> by ${organization_name}.
Contact <a href="mailto:${help_email}">${help_email}</a> if you have any questions.
</p>`;
  const text = `\n\n\n\n----------------------------------------------------------------------
This email was sent from ${site_name} by ${organization_name} (see ${organization_url}).
Contact ${help_email} if you have any questions.
`;
  return { html, text };
}

export default async function appendFooter(message: Message): Promise<Message> {
  let footer;
  try {
    footer = await getFooter();
  } catch (_) {
    return message;
  }
  return {
    ...message,
    html: message.html + "\n\n" + footer.html,
    text: message.text + "\n\n" + footer.text,
  };
}
