import getPool from "@cocalc/backend/database";
import { generate } from "random-key";
import siteURL from "@cocalc/backend/server-settings/site-url";

export async function getVerifyEmail(
  email_address: string
): Promise<{ html: string; text: string }> {
  const token = await getToken(email_address);
  const site_url = await siteURL();
  const url = `${site_url}/auth/verify/${token}?email=${encodeURIComponent(
    email_address
  )}`;
  return body(url);
}

async function getToken(email_address: string): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, email_address_challenge FROM accounts WHERE email_address=$1",
    [email_address]
  );
  if (rows.length == 0) {
    throw Error(`no account with email address "${email_address}"`);
  }
  const { account_id, email_address_challenge } = rows[0];
  if (
    email_address_challenge?.token &&
    email_address_challenge.email == email_address
  ) {
    // return the same token if there is one for the same email
    return email_address_challenge.token;
  }
  const token = generate(16).toLowerCase();
  const data = { email: email_address, token, time: new Date() };
  await pool.query(
    "UPDATE accounts SET email_address_challenge = $1::JSONB WHERE account_id = $2::UUID",
    [data, account_id]
  );
  return token;
}

function body(url: string): { html: string; text: string } {
  const html = `
<p style="margin-top:0;margin-bottom:20px;">
<strong>
Please <a href="${url}">verify your email address</a>!
</strong>
</p>

<p style="margin-top:0;margin-bottom:20px;">
If the above link does not work, please copy and paste the following
URL into a new browser tab:
</p>

<pre style="margin-top:10px;margin-bottom:10px;font-size:11px;">
${url}
</pre>
`;

  const text = `
Please verify your email address by visiting the following URL in your web browser:

${url}

`;

  return { html, text };
}
