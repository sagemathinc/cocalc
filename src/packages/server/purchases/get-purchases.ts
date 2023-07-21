import getPool from "@cocalc/database/pool";
import { Service, MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { getLastClosingDate } from "./closing-date";

interface Options {
  account_id: string;
  cutoff?: Date; // returns purchases back to this date (limit/offset NOT ignored)
  thisMonth?: boolean;
  limit?: number;
  offset?: number;
  service?: Service;
  project_id?: string;
  group?: boolean; // if true, group all results by service, project_id together, along with the sum of the cost.  This provides a nice summary without potentially hundreds of rows for every single chat, etc.
  day_statement_id?: number;
  month_statement_id?: number;
  no_statement?: boolean; // only purchases not on any statement
  noCache?: boolean;
}

export default async function getPurchases({
  account_id,
  cutoff,
  thisMonth,
  limit = 100,
  offset,
  service,
  project_id,
  group,
  day_statement_id,
  month_statement_id,
  no_statement,
  noCache,
}: Options): Promise<Purchase[]> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool(noCache ? undefined : "medium");
  let query;
  if (group) {
    query =
      "SELECT SUM(cost), service, project_id, CAST(COUNT(*) AS INTEGER) AS count FROM purchases WHERE account_id=$1";
  } else {
    query =
      "SELECT id, time, cost, period_start, cost_per_hour, service, description, invoice_id, project_id, pending FROM purchases WHERE account_id=$1";
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
  if (day_statement_id != null) {
    params.push(day_statement_id);
    query += ` AND day_statement_id=$${params.length}`;
  }
  if (month_statement_id != null) {
    params.push(month_statement_id);
    query += ` AND month_statement_id=$${params.length}`;
  }
  if (thisMonth) {
    const date = await getLastClosingDate(account_id);
    params.push(date);
    query += ` AND time >= $${params.length}`;
  }
  if (cutoff) {
    params.push(cutoff);
    query += ` AND time >= $${params.length}`;
  }
  if (no_statement) {
    query += " AND day_statement_id IS NULL AND month_statement_id IS NULL ";
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
  return rows as unknown as Purchase[];
}
