// Get email address of an account. If no such account or email not set, returns undefined...
// Answers are cached for a while.

import getPool from "@cocalc/database/pool";

export default async function getEmailAddress(
  account_id: string
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return rows[0]?.email_address;
}
