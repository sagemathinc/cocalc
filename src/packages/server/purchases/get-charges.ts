import getPool from "@cocalc/database/pool";
import { getLastClosingDate } from "./closing-date";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";

export async function getTotalChargesThisMonth(
  account_id: string,
  service?: Service
): Promise<number> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  const { query, params } = getQueryMonth(account_id, closing_date, service);
  const { rows } = await pool.query(query, params);
  return rows[0].total ?? 0;
}

function getQueryMonth(
  account_id: string,
  closing_date: Date,
  service?: Service
) {
  let query = `SELECT SUM(cost) as total FROM purchases WHERE account_id=$1 AND time > $2 AND cost > 0`;
  const params = [account_id, closing_date];
  if (service != null) {
    query += " AND service=$3";
    params.push(service);
  }
  return { query, params };
}
