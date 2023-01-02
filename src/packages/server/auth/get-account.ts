/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { getAccountIdFromApiKey } from "@cocalc/server/auth/api";
import { getRememberMeHash } from "@cocalc/server/auth/remember-me";

// Return account_id if they are signed in.
// If not, returns undefined.
// This is determined by looking in their cookie and checking
// who it identifies in the database.
export default async function getAccountId(
  req,
  noCache: boolean = false
): Promise<string | undefined> {
  if (req == null) return;
  // caching a bit --  We thus want the query below to happen rarely.  We also
  // get expire field as well (since it is usually there) so that the result isn't empty
  // (hence not cached) when a cookie has expired.
  const hash = getRememberMeHash(req);
  if (!hash) {
    // not signed in via a cookie.
    // What about an api key?
    if (req.header("Authorization")) {
      try {
        return await getAccountIdFromApiKey(req);
      } catch (_err) {
        // non-fatal, at least for now...
        return;
      }
    }
    return;
  }
  const pool = getPool(noCache ? "short" : undefined);
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
