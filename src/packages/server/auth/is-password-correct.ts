/*
Returns true if the account with given id exists and the password
is correct for the account.  Returns false in all other cases.

NOTE: Of course some accounts don't even have a password, in which
case this will always return false.
*/

import getPool from "@cocalc/database/pool";
import { verifyPassword } from "@cocalc/backend/auth/password-hash";

interface Options {
  account_id: string;
  password: string;
}

export default async function isPasswordCorrect({
  account_id,
  password,
}: Options): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT password_hash FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) return false;
  const { password_hash } = rows[0];
  if (!password_hash) return false;
  return verifyPassword(password, password_hash);
}
