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
  [account_id: string]: { first_name: string; last_name: string; profile? };
};

function canonicalName(row) {
  // some accounts have these null for some reason sometimes, but it is nice if client code can assume not null.
  let { first_name = "", last_name = "", profile } = row;
  first_name = (first_name ?? "").trim();
  last_name = (last_name ?? "").trim();
  if (!first_name && !last_name) {
    // Also ensure both are not empty so you can always see something.  I think the frontend and/or api doesn't
    // allow a user to make their name empty, but *just in case* we do this.
    first_name = "No";
    last_name = "Name";
  }
  return { first_name, last_name, profile };
}

function rowsToNames(rows, account_ids): Names {
  const x: Names = {};
  const known = new Set<string>();
  for (const row of rows) {
    x[row.account_id] = canonicalName(row);
    known.add(row.account_id);
  }
  for (const account_id of account_ids) {
    // Any names not present above must be from deleted accounts or possibly invalid UUID's, which
    // might be the ame thing at some point.
    if (!known.has(account_id)) {
      x[account_id] = { first_name: "Deleted", last_name: "User" };
    }
  }
  return x;
}

// This also includes the user's profile info, e.g., color or gravatar or image

export async function getNames(account_ids: string[]): Promise<Names> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT account_id, first_name, last_name, profile FROM accounts WHERE account_id=ANY($1::UUID[]) AND (deleted IS NULL OR deleted = false)",
    [account_ids],
  );
  return rowsToNames(rows, account_ids);
}
