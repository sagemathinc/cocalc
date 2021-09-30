import getPool from "@cocalc/util-node/database";
import generateHash from "@cocalc/util-node/auth/hash";

// Return account_id if they are signed in.
// If not, returns undefined.
// This is determined by looking in their cookie and checking
// who it identifies in the database.
export default async function getAccount(
  cookie: string
): Promise<string | undefined> {
  const pool = getPool("long");
  // important to use CHAR(127) and not TEXT for 100x performance
  const hash = getHash(cookie);
  const result = await pool.query(
    "SELECT account_id FROM remember_me WHERE hash = $1::CHAR(127) AND expire > NOW()",
    [hash]
  );
  if (result.rows.length == 0) {
    return;
  }
  return result.rows[0].account_id;
}

function getHash(cookie: string): string {
  const x: string[] = cookie.split("$");
  if (x.length !== 4) {
    throw Error("badly formatted remember_me cookie");
  }
  return generateHash(x[0], x[1], x[2], x[3]).slice(0, 127);
}
