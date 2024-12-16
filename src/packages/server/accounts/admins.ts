import getPool from "@cocalc/database/pool";

// get account_id's of all admins -- "long" cache
// *Always sorted by account_id lexicographically.*

export default async function admins(): Promise<string[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts where 'admin' = ANY(groups) AND coalesce(deleted,false) = false",
  );
  return rows.map(({ account_id }) => account_id).sort();
}
