/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Set email address of an account.

The password must also be provided. If the email address is already set in the
database, then password has to be the current correct password. If the email
address is NOT set, then a new email address and password are set.

Also, if user changes email address to one that has some pending actions, carry
those actions out.  (TODO: should probably only do these after email address
is verified.)

Throws an exception if something is wrong.
*/

import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import getPool from "@cocalc/database/pool";
import { checkRequiredSSO } from "@cocalc/server/auth/sso/check-required-sso";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";
import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";
import {
  isValidUUID,
  is_valid_email_address as isValidEmailAddress,
} from "@cocalc/util/misc";
import { StripeClient } from "../stripe/client";
import accountCreationActions, {
  creationActionsDone,
} from "./account-creation-actions";
import sendEmailVerification from "./send-email-verification";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("server:accounts:email-address");

export default async function setEmailAddress({
  account_id,
  email_address,
  password,
}: {
  account_id: string;
  email_address: string;
  password: string;
}): Promise<void> {
  log.debug("setEmailAddress", account_id, email_address);
  if (!isValidUUID(account_id)) {
    throw Error("account_id is not valid");
  }
  if (!isValidEmailAddress(email_address)) {
    throw Error("email address is not valid");
  }
  email_address = email_address.toLowerCase();
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address, password_hash, email_address_verified, stripe_customer_id FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error("no such account");
  }
  const {
    password_hash,
    email_address: old_email_address,
    email_address_verified,
    stripe_customer_id,
  } = rows[0];

  // if you have an email address that's controlled by an "exclusive" SSO strategy
  // you're not allowed to change your email address
  const strategies = await getStrategies();
  const strategy = checkRequiredSSO({ strategies, email: old_email_address });
  if (strategy != null) {
    // user has no password set, so we can set it – but not the email address
    if (!password_hash) {
      await pool.query(
        "UPDATE accounts SET password_hash=$1 WHERE account_id=$2",
        [passwordHash(password), account_id],
      );
    }
    throw new Error(`You are not allowed to change your email address`);
  }

  // you're also not allowed to change your email address to one that's covered by an exclusive strategy
  if (checkRequiredSSO({ strategies, email: email_address }) != null) {
    throw new Error(
      `You are not allowed to change your email address to this one`,
    );
  }

  if (!password_hash) {
    // setting both the email_address *and* password at once.
    await pool.query(
      "UPDATE accounts SET password_hash=$1, email_address=$2 WHERE account_id=$3",
      [passwordHash(password), email_address, account_id],
    );
    return;
  }
  // Verify that existing password is correct.
  if (!verifyPassword(password, password_hash)) {
    throw Error("password is incorrect");
  }

  // Is the email address available?
  if (
    (
      await pool.query(
        "SELECT COUNT(*)::INT FROM accounts WHERE email_address=$1",
        [email_address],
      )
    ).rows[0].count > 0
  ) {
    throw Error(
      `email address "${email_address}" is already in use by another account`,
    );
  }

  // Set the email address:
  await pool.query("UPDATE accounts SET email_address=$1 WHERE account_id=$2", [
    email_address,
    account_id,
  ]);

  // Do any pending account creation actions for this email.
  await accountCreationActions({ email_address, account_id });
  await creationActionsDone(account_id);

  // sync new email address with stripe
  if (stripe_customer_id != null) {
    try {
      const stripe = new StripeClient({ account_id });
      await stripe.update_database();
    } catch (err) {
      console.warn(
        `ERROR syncing new email address with stripe: ${err} – ignoring`,
      );
    }
  }

  // if the email_address is not in the dict of verified email addresses, send a verification email
  // we do this at the very end, since we don't want an error sending the verification email
  // disrupt the account creation process above
  if (email_address_verified?.[email_address] == null) {
    await sendEmailVerification(account_id);
  }
}
