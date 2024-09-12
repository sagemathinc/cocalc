// If no such account or no name set, returns "Unknown User".
// Answers are cached for a while.

import getPool from "@cocalc/database/pool";

export default async function getName(
  account_id: string,
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE account_id=$1",
    [account_id],
  );
  return rowsToName(rows);
}

export async function getNameByEmail(
  email_address: string,
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE email_address=$1",
    [email_address],
  );
  return rowsToName(rows);
}

function rowsToName(rows): string | undefined {
  if (rows.length == 0 || (!rows[0].first_name && !rows[0].last_name)) return;
  return [rows[0].first_name ?? "", rows[0].last_name ?? ""].join(" ");
}

type Names = {
  [account_id: string]: { first_name: string; last_name: string };
};

function rowsToNames(rows): Names {
  const x: Names = {};
  for (const row of rows) {
    // some accounts have these null for some reason sometimes, but it is nice if client code can assume not null.
    x[row.account_id] = {
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
    };
  }
  return x;
}

export async function getNames(account_ids: string[]): Promise<Names> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT account_id, first_name, last_name FROM accounts WHERE account_id=ANY($1::UUID[])",
    [account_ids],
  );
  return rowsToNames(rows);
}
