/*
If the account with given id does not exist, throw an error.

Return true if the account with given id exists and has a password set.

Otherwise, return false... since auth is only doing via a passport.
*/

import getPool from "@cocalc/database/pool";

export default async function hasPassword(
  account_id: string
): Promise<boolean> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT password_hash FROM accounts WHERE account_id=$1::UUID",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error("no such account");
  }
  return !!rows[0].password_hash;
}
