import getPool from "@cocalc/database/pool";
import { getLastClosingDate } from "./closing-date";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";

export async function getTotalChargesThisMonth(
  account_id: string,
  service?: Service
): Promise<number> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  let query = `SELECT SUM(cost) as total FROM purchases WHERE account_id=$1 AND time > $2 AND cost > 0`;
  const params = [account_id, closing_date];
  if (service != null) {
    query += " AND service=$3";
    params.push(service);
  }
  const { rows } = await pool.query(query, params);
  return rows[0].total ?? 0;
}

// Returns the total charges this month grouped by service.
// Unlike getTotalChargesThisMonth, credits are included as one of the service categories.
export async function getChargesThisMonthByService(
  account_id: string
): Promise<{ [service: string]: number }> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  let query = `SELECT service, SUM(cost) as total FROM purchases WHERE account_id=$1 AND time > $2 GROUP BY service`;
  const params = [account_id, closing_date];
  const { rows } = await pool.query(query, params);
  return rows.reduce(
    (map, { service, total }) => ({ ...map, [service]: total }),
    {}
  );
}
