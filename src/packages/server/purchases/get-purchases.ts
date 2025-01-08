/*
Important -- we return the balance along with getting the list of purchases
because it's very important that we have a consistent query of both things
and compute the resulting balance properly.  We were doing this on the frontend,
and there could be a skew between updating the list of purchases and computing
the balance, which sometimes made the balances listed in the purchase table out
of whack, which is confusing.

Also important: balance at a point in time is NOT constant when there are
**active payg transactions**.  That's why we fill it in.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import { Service, MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { getLastClosingDate } from "./closing-date";
import { COST_OR_METERED_COST } from "./get-balance";
import getBalance from "./get-balance";
import { getOwner } from "@cocalc/server/compute/owner";

interface Options {
  account_id: string;
  // returns purchases back to this date (limit/offset NOT ignored); never excludes unfinished purchases (i.e., with cost not set)
  cutoff?: Date;
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
  // For admins - if true, include email_address, first_name, and last_name
  // fields from the accounts table, for each user. Ignored if group is true.
  includeName?: boolean;
  // if a global compute server is specified, get ONLY purchases involving
  // that compute server.  account_id must be a collaborator on the project
  // containing this compute server.  This is one case where a user can
  // get purchases that are owned by a different user.
  compute_server_id?: number;
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
  includeName,
  compute_server_id,
}: Options): Promise<{ balance: number; purchases: PurchaseData[] }> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const params: any[] = [];
  const conditions: string[] = [];
  let query;

  if (compute_server_id) {
    // switch account_id to account that owns the compute server. This
    // throws error if requesting account_id is not a collab on project
    // that contains the compute server.
    account_id = await getOwner({ compute_server_id, account_id });
  }

  if (group) {
    query = `
  SELECT SUM(${COST_OR_METERED_COST}) AS cost, service, p.project_id, CAST(COUNT(*) AS INTEGER) AS count
  FROM purchases AS p`;
  } else {
    query =
      "SELECT p.id, p.time, p.cost, p.period_start, p.period_end, p.cost_per_hour, p.cost_so_far, p.service, p.description, p.invoice_id, p.project_id, p.notes" +
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
    conditions.push(`(p.time >= $${params.length} OR p.cost IS NULL)`);
  }
  if (no_statement) {
    conditions.push("p.day_statement_id IS NULL");
    conditions.push("p.month_statement_id IS NULL");
  }
  if (compute_server_id) {
    params.push(compute_server_id);
    conditions.push(
      `(p.description#>'{compute_server_id}')::integer = $${params.length}`,
    );
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  if (group) {
    query += " GROUP BY p.service, p.project_id ORDER BY cost DESC";
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

  // get all the purchases and the user balance in a single transaction:
  const client = await getTransactionClient();
  try {
    // This line is needed so that even if somebody writes to the database
    // between grabbing purchases and getting balance, we see the balance without
    // that purchase:
    client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;");
    const { rows: purchases } = await client.query(query, params);
    const balance = await getBalance({ account_id, client, noSave: true });
    return { purchases: purchases as unknown as PurchaseData[], balance };
  } finally {
    try {
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }
}
