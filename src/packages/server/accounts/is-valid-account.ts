import getPool from "@cocalc/database/pool";
import LRU from "lru-cache";

// cache "yes" for an hour, but never cache "no", since an account might get
// created and then immediately get used, and isValidAccount show then return
// true.  Also, once an account is created it never gets deleted (as record from db)
// so answer is always yes afterwards.
const cache = new LRU<string, boolean>({ max: 10000, ttl: 1000 * 60 * 60 });

export default async function isValidAccount(
  account_id: string
): Promise<boolean> {
  if (cache.has(account_id)) {
    return true;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) as count FROM accounts WHERE account_id = $1::UUID",
    [account_id]
  );
  if (rows[0].count > 0) {
    // only cache true, as explained in the comment above.
    cache.set(account_id, true);
    return true;
  }
  return false;
}
