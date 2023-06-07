import getPool from "@cocalc/database/pool";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";

export default async function getBalance(
  account_id: string,
  service?: Service
): Promise<number> {
  const pool = getPool("medium");
  const { query, params } = getQuery(account_id, service);
  const { rows } = await pool.query(query, params);
  return rows[0].total_cost ?? 0;
}

function getQuery(account_id: string, service?: Service) {
  let query =
    "SELECT SUM(cost) as total_cost FROM purchases WHERE account_id=$1 AND paid IS NOT true";
  const params = [account_id];
  if (service != null) {
    query += " AND service=$2";
    params.push(service);
  }
  return { query, params };
}
