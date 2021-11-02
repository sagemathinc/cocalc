/*
"Redeem" an email verification token.  This checks everything is valid, then sets that the email
has been verified.
*/

import getPool from "@cocalc/backend/database";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";

export default async function redeemVerifyEmail(
  email_address: string,
  token: string
): Promise<void> {
  if (token.length < 16) {
    throw Error("token is too short");
  }
  if (!isValidEmailAddress(email_address)) {
    throw Error("email_address is not valid");
  }

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, email_address_challenge, email_address_verified FROM accounts WHERE email_address=$1",
    [email_address]
  );
  if (rows.length == 0) {
    throw Error(`no account with email address ${email_address}`);
  }
  const { account_id, email_address_challenge, email_address_verified } =
    rows[0];
  if (!email_address_challenge?.email) {
    if (email_address_verified?.[email_address]) {
      // nothing to do.
      return;
    }
    throw Error(`no email verification configured for ${email_address}`);
  }

  if (email_address_challenge.token != token) {
    throw Error("tokens do not match");
  }
  // we're good, save this in the email_address_verified JSONB record and also delete the challenge
  await pool.query(
    "UPDATE accounts SET email_address_challenge=NULL, email_address_verified=$1::JSONB WHERE account_id=$2",
    [{ ...email_address_verified, [email_address]: new Date() }, account_id]
  );
}

export async function isEmailVerified(email_address: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address_verified FROM accounts WHERE email_address=$1::TEXT",
    [email_address]
  );
  if (rows.length == 0) return false;
  const { email_address_verified } = rows[0];
  return !!email_address_verified[email_address];
}
