/*
1. check that the password reset id is valid still; throw error if not
2. check that the password is valid; throw error if not
3. invalidate password reset id by writing that it is used to the database
4. write hash of new password to the database
5. Return account_id of user who just reset their password.
*/

import getPool from "@cocalc/backend/database";
import getAccountId from "@cocalc/backend/database/account/get";
import setPassword from "@cocalc/backend/database/account/set-password";

export default async function redeemPasswordReset(
  password: string,
  passwordResetId: string
): Promise<string> {
  if (password.length < 6) {
    // won't happen in practice because frontend UI prevents this...
    throw Error("password is too short");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address FROM password_reset WHERE expire > NOW() AND id=$1::UUID",
    [passwordResetId]
  );
  if (rows.length == 0) {
    throw Error("Password reset no longer valid.");
  }
  const { email_address } = rows[0];

  await pool.query("UPDATE password_reset SET expire=NOW() WHERE id=$1::UUID", [
    passwordResetId,
  ]);

  const account_id = await getAccountId({ email_address });
  await setPassword(account_id, password);
  return account_id;
}
