// If no such account or no name set, returns "Unknown User".
// Answers are cached for a while.

import getPool from "@cocalc/backend/database";

export default async function getName(account_id: string): Promise<string> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return `${rows[0]?.first_name ?? "Unknown"} ${rows[0]?.last_name ?? "User"}`;
}
