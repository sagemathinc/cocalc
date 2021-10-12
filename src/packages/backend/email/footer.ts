interface Opts {
  site_url: string;
  site_name: string;
  company_name: string;
  help_email: string;
}

export default function getFooter({
  site_url,
  site_name,
  company_name,
  help_email,
}: Opts): { html: string; text: string } {
  const html = `
<p style="margin-top:100px; border-top: 1px solid gray; color: gray; font-size:85%; text-align:center">
This email was sent from <a href="${site_url}">${site_name}</a> by ${company_name}.
Contact <a href="mailto:${help_email}">${help_email}</a> if you have any questions.
</p>`;
  const text = `\n\n\n\n----------------------------------------------------------------------
This email was sent from ${site_name} by ${company_name}.
Contact ${help_email} if you have any questions.
`;
  return { html, text };
}
