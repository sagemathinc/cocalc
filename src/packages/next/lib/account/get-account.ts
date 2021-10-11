import getPool from "@cocalc/backend/database";
import generateHash from "@cocalc/backend/auth/hash";

// Return account_id if they are signed in.
// If not, returns undefined.
// This is determined by looking in their cookie and checking
// who it identifies in the database.
export default async function getAccount(
  cookie: string
): Promise<string | undefined> {
  // caching a bit --  We thus want the query below to happen rarely.  We also
  // get expire field as well (since it is usually there) so that the result isn't empty
  // (hence not cached) when a cookie has expired.
  const pool = getPool("short");
  const hash = getHash(cookie);
  // important to use CHAR(127) instead of TEXT for 100x performance gain.
  const result = await pool.query(
    "SELECT account_id, expire FROM remember_me WHERE hash = $1::CHAR(127)",
    [hash]
  );
  if (result.rows.length == 0) {
    return;
  }
  const { account_id, expire } = result.rows[0];
  if (expire <= new Date()) {
    // expired
    return;
  }
  return account_id;
}

function getHash(cookie: string): string {
  const x: string[] = cookie.split("$");
  if (x.length !== 4) {
    throw Error("badly formatted remember_me cookie");
  }
  return generateHash(x[0], x[1], parseInt(x[2]), x[3]).slice(0, 127);
}
