import getPool from "@cocalc/util-node/database";
import { Stats } from "@cocalc/util/db-schema/stats";

// Returns undefined if no stats data is available.
export default async function getStats(): Promise<Stats | undefined> {
  const pool = getPool('long');
  const result = await pool.query(
    "SELECT * FROM stats ORDER BY time DESC LIMIT 1"
  );
  if (result.rows.length == 0) return;
  const data = result.rows[0];
  data.time = data.time.valueOf();
  return data;
}
