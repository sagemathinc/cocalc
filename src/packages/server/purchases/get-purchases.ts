import getPool from "@cocalc/database/pool";
import { Service, MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import { getLastClosingDate } from "./closing-date";

interface Options {
  account_id: string;
  thisMonth?: boolean; // if true, returns all purchases during this billing cycle; limit/offset are ignored.
  limit?: number;
  offset?: number;
  service?: Service;
  project_id?: string;
  group?: boolean; // if true, group all results by service, project_id together, along with the sum of the cost.  This provides a nice summary without potentially hundreds of rows for every single chat, etc.
}

export default async function getPurchases({
  account_id,
  thisMonth,
  limit = 50,
  offset,
  service,
  project_id,
  group,
}: Options) {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool("medium");
  let query;
  if (group) {
    query =
      "SELECT SUM(cost), service, project_id, CAST(COUNT(*) AS INTEGER) AS count FROM purchases WHERE account_id=$1";
  } else {
    query =
      "SELECT id, time, cost, service, description, invoice_id, project_id FROM purchases WHERE account_id=$1";
  }
  const params: any[] = [account_id];
  if (service != null) {
    params.push(service);
    query += ` AND service=$${params.length}`;
  }
  if (project_id != null) {
    params.push(project_id);
    query += ` AND project_id=$${params.length}`;
  }
  if (thisMonth) {
    const date = await getLastClosingDate(account_id);
    params.push(date);
    query += ` AND time >= $${params.length}`;
  }
  if (group) {
    query += " GROUP BY service, project_id";
  }
  if (!group) {
    query += " ORDER BY time DESC";
    if (!thisMonth) {
      if (limit != null) {
        params.push(limit);
        query += ` limit $${params.length}`;
      }
      if (offset != null) {
        params.push(offset);
        query += ` offset $${params.length}`;
      }
    }
  }

  const { rows } = await pool.query(query, params);
  return rows;
}
