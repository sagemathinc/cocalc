import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";

// cache YES answer for 10 minute and NO answer for 1 minute
// this means isBanned can take up to 60 seconds to fully take
// effect against a user, and 10 minutes to remove.
const noCache = new LRU<string, boolean>({ max: 10000, ttl: 1000 * 60 });
const yesCache = new LRU<string, boolean>({ max: 10000, ttl: 10 * 1000 * 60 });

export default async function isBanned(
  account_id: string | null | undefined,
): Promise<boolean> {
  if (!account_id) {
    return false;
  }
  if (yesCache.has(account_id)) {
    // user is definitely considered banned.  Takes up to 10 minutes to time out.
    return true;
  }
  if (noCache.has(account_id)) {
    // user definitely not banned, at least within last minute
    return false;
  }
  // Have to do a DB query.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT banned FROM accounts WHERE account_id = $1::UUID",
    [account_id],
  );
  if (rows[0]?.banned) {
    // account exists and is banned
    yesCache.set(account_id, true);
    noCache.delete(account_id);
    return true;
  } else {
    noCache.set(account_id, true);
    yesCache.delete(account_id);
  }
  return false;
}

