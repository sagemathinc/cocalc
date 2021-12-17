/*
Set or change the password of an account.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";

export default async function setPassword(
  account_id: string,
  current_password: string,
  new_password: string
): Promise<void> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is not valid");
  }
  const pool = getPool();

  const { rows } = await pool.query(
    "SELECT password_hash FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error("No such account");
  }
  const { password_hash } = rows[0];
  if (password_hash) {
    // user had a password set before, so it needs to match
    if (!verifyPassword(current_password, password_hash)) {
      throw Error("Current password is incorrect.");
    }
  }

  // save the hash (only!) of the new password.
  await pool.query("UPDATE accounts SET password_hash=$1 WHERE account_id=$2", [
    passwordHash(new_password),
    account_id,
  ]);
}
