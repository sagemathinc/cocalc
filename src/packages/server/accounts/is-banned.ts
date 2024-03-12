import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";

// cache "yes" for a minute, but never cache "no".
const cache = new LRU<string, boolean>({ max: 10000, ttl: 1000 * 60 });

export default async function isBanned(account_id: string): Promise<boolean> {
  if (cache.has(account_id)) {
    return true;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT banned FROM accounts WHERE account_id = $1::UUID",
    [account_id],
  );
  if (rows[0]?.banned) {
    // account exists and is banned
    cache.set(account_id, true);
    return true;
  }
  return false;
}
