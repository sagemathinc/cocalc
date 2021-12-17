/*
Similar to the public profile, but also get additional information
that shouldn't be made available to anybody who knows this account_id.

Only call this for the account_id of the signed in user.
*/

import getPool from "@cocalc/database/pool";
import { Profile } from "./types";

export default async function getPrivateProfile(
  account_id: string,
  noCache: boolean = false
): Promise<Profile> {
  const pool = getPool(noCache ? undefined : "medium");
  const { rows } = await pool.query(
    "SELECT first_name, last_name, profile, name, groups, password_hash, passports FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error(`no account with id ${account_id}`);
  }
  const is_admin = !!rows[0].groups?.includes("admin");
  const is_anonymous = !rows[0].password_hash && !rows[0].passports;
  return {
    account_id,
    first_name: rows[0].first_name ?? "Anonymous",
    last_name: rows[0].last_name ?? "User",
    image: rows[0].profile?.image,
    color: rows[0].profile?.color,
    name: rows[0].name,
    is_admin,
    is_anonymous,
  };
}
