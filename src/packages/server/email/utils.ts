/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { sha1 } from "@cocalc/util/misc";

import { getServerSettings } from "../settings";

/**
 * Generate a token for the given email address and account id, by hashing the email address and account id with a shared secret.
 */
export async function generateEmailSecretToken({
  email_address,
  account_id,
}: {
  email_address: string;
  account_id: string;
}): Promise<string> {
  const { email_shared_secret: secret } = await getServerSettings();
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("email_shared_secret not set");
  }
  return sha1(`${email_address}:${account_id}:${secret}`);
}

/**
 * Check, if the given email token is correct
 */
export async function isValidEmailToken({
  email_address,
  account_id,
  token,
}: {
  email_address: string;
  account_id: string;
  token: string;
}): Promise<boolean> {
  const expected = await generateEmailSecretToken({
    email_address,
    account_id,
  });
  return token === expected;
}


export const VERIFY_EMAIL_BLOCK_MD = `
Please [click here]({{siteURL}}{{token_url}}) to verify your email address.

If this link does not work, please copy/paste this URL into a new browser tab and open the link:

\`\`\`
{{siteURL}}{{token_url}}
\`\`\`
`;
