import getPool from "@cocalc/database/pool";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import { getLastClosingDate } from "./closing-date";

export default async function getBalance(
  account_id: string,
  service?: Service
): Promise<number> {
  const pool = getPool();
  const { query, params } = getQuery(account_id, service);
  const { rows } = await pool.query(query, params);
  return rows[0].total_cost ?? 0;
}

function getQuery(account_id: string, service?: Service) {
  let query =
    "SELECT SUM(cost) as total_cost FROM purchases WHERE account_id=$1";
  const params = [account_id];
  if (service != null) {
    query += " AND service=$2";
    params.push(service);
  }
  return { query, params };
}

export async function getLastStatementBalance(
  account_id: string
): Promise<number> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  const { query, params } = getQueryMonth(account_id, closing_date, "<=");
  const { rows } = await pool.query(query, params);
  return rows[0].total_cost ?? 0;
}

export async function getBalanceThisMonth(
  account_id: string,
  service?: Service
): Promise<number> {
  const pool = getPool();
  const closing_date = await getLastClosingDate(account_id);
  const { query, params } = getQueryMonth(
    account_id,
    closing_date,
    ">",
    service
  );
  const { rows } = await pool.query(query, params);
  return rows[0].total_cost ?? 0;
}

function getQueryMonth(
  account_id: string,
  closing_date: Date,
  operator: string,
  service?: Service
) {
  let query = `SELECT SUM(cost) as total_cost FROM purchases WHERE account_id=$1 AND time ${operator} $2`;
  const params = [account_id, closing_date];
  if (service != null) {
    query += " AND service=$3";
    params.push(service);
  }
  return { query, params };
}
