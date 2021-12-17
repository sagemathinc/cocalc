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

import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import accountCreationActions, {
  creationActionsDone,
} from "./account-creation-actions";

export default async function setEmailAddress(
  account_id: string,
  email_address: string,
  password: string
): Promise<void> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is not valid");
  }
  if (!isValidEmailAddress(email_address)) {
    throw Error("email address is not valid");
  }
  email_address = email_address.toLowerCase();
  if (!password || password.length < 6) {
    throw Error("password must be at least 6 characters");
  }

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT password_hash FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error("no such account");
  }
  const { password_hash } = rows[0];
  if (!password_hash) {
    // setting both the email_address *and* password at once.
    await pool.query(
      "UPDATE accounts SET password_hash=$1, email_address=$2 WHERE account_id=$3",
      [passwordHash(password), email_address, account_id]
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
      await pool.query("SELECT COUNT(*) FROM accounts WHERE email_address=$1", [
        email_address,
      ])
    ).rows[0].count > 0
  ) {
    throw Error(
      `email address "${email_address}" is already in use by another account`
    );
  }

  // Set the email address:
  await pool.query("UPDATE accounts SET email_address=$1 WHERE account_id=$2", [
    email_address,
    account_id,
  ]);

  // Do any pending account creation actions for this email.
  await accountCreationActions(email_address, account_id);
  await creationActionsDone(account_id);
}
