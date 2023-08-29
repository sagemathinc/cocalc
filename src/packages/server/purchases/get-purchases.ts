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
  // if group is true, group all results by service, project_id together, along with
  // the sum of the cost.  This provides a nice summary without potentially hundreds
  // of rows for every single chat, etc.
  group?: boolean;
  day_statement_id?: number;
  month_statement_id?: number;
  no_statement?: boolean; // only purchases not on any statement
  noCache?: boolean;
  // For admins - if true, include email_address, first_name, and last_name fields from the accounts table, for each user. Ignored if group is true.
  includeName?: boolean;
}

interface PurchaseData extends Purchase {
  first_name?: string;
  last_name?: string;
  email_address?: string;
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
  includeName,
}: Options): Promise<PurchaseData[]> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool(noCache ? undefined : "medium");
  const params: any[] = [];
  const conditions: string[] = [];
  let query;

  if (group) {
    query =
      "SELECT SUM(cost), service, p.project_id, CAST(COUNT(*) AS INTEGER) AS count" +
      " FROM purchases as p";
  } else {
    query =
      "SELECT p.id, p.time, p.cost, p.period_start, p.period_end, p.cost_per_hour, p.service, p.description, p.invoice_id, p.project_id, p.pending, p.notes" +
      (includeName ? ", a.email_address, a.first_name, a.last_name " : "") +
      " FROM purchases as p";
    if (includeName) {
      query += " INNER JOIN accounts as a ON p.account_id = a.account_id ";
    }
  }

  if (account_id) {
    // account_id is allowed to not be specified in one case: admin queries, e.g.,
    // using api to get all transactions.
    conditions.push("p.account_id=$1");
    params.push(account_id);
  }
  if (service != null) {
    params.push(service);
    conditions.push(`p.service=$${params.length}`);
  }
  if (project_id != null) {
    params.push(project_id);
    conditions.push(`p.project_id=$${params.length}`);
  }
  if (day_statement_id != null) {
    params.push(day_statement_id);
    conditions.push(`p.day_statement_id=$${params.length}`);
  }
  if (month_statement_id != null) {
    params.push(month_statement_id);
    conditions.push(`p.month_statement_id=$${params.length}`);
  }
  if (thisMonth) {
    const date = await getLastClosingDate(account_id);
    params.push(date);
    conditions.push(`p.time >= $${params.length}`);
  }
  if (cutoff) {
    params.push(cutoff);
    conditions.push(`p.time >= $${params.length}`);
  }
  if (no_statement) {
    conditions.push("p.day_statement_id IS NULL");
    conditions.push("p.month_statement_id IS NULL");
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  if (group) {
    query += " GROUP BY p.service, p.project_id";
  }
  if (!group) {
    query += " ORDER BY p.time DESC";
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
  return rows as unknown as PurchaseData[];
}
