import basePath from "@cocalc/backend/base-path";
import { v4 } from "uuid";
import passwordHash from "@cocalc/backend/auth/password-hash";
import getPool from "@cocalc/database/pool";
import { expireTime } from "@cocalc/database/pool/util";

export const COOKIE_NAME = `${
  basePath.length <= 1 ? "" : encodeURIComponent(basePath)
}remember_me`;

// Create a remember me cookie for the given account_id and store
// it in the database.  The cookie is similar to using a server
// assigned random uuid-v4 as a password.  The user knows the
// uuid-v4, and we only store what it hashes to, so even if
// somebody gets our database, they can't make fake cookies and use
// them to sign in.
export async function createRememberMeCookie(account_id: string): Promise<{
  // the value of the cookie, which encodes
  // a random uuid-v4 and the hash algorithm
  value: string;
  // time to live of the cookie in seconds, after which the
  // database considers it invalid; cookie should have same age
  ttl_s: number;
}> {
  // compute the value and ttl_s:
  const session_id: string = v4();
  const hash_session_id: string = passwordHash(session_id);
  const x: string[] = hash_session_id.split("$");
  const value = [x[0], x[1], x[2], session_id].join("$");
  const ttl_s: number = 24 * 3600 * 30; // 30 days -- seems to work well, but this could be per user configurable, etc.

  // store the cookie in the database
  const pool = getPool();
  await pool.query(
    "INSERT INTO remember_me (hash, expire, account_id) VALUES($1::TEXT, $2::TIMESTAMP, $3::UUID)",
    [hash_session_id.slice(0, 127), expireTime(ttl_s), account_id]
  );

  return { value, ttl_s };
}

// delete the remember me database entry for the given hash
export async function deleteRememberMe(hash: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM remember_me WHERE hash=$1::TEXT", [
    hash.slice(0, 127),
  ]);
}

// delete all remember me cookies for the account
export async function deleteAllRememberMe(account_id: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM remember_me WHERE account_id=$1::UUID", [
    account_id,
  ]);
}
