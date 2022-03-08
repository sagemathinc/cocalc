// If no such account or no name set, returns "Unknown User".
// Answers are cached for a while.

import getPool from "@cocalc/database/pool";

export default async function getName(
  account_id: string
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return rowsToName(rows);
}

export async function getNameByEmail(
  email_address: string
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE email_address=$1",
    [email_address]
  );
  return rowsToName(rows);
}

function rowsToName(rows): string | undefined {
  if (rows.length == 0 || (!rows[0].first_name && !rows[0].last_name)) return;
  return [rows[0].first_name ?? "", rows[0].last_name ?? ""].join(" ");
}
