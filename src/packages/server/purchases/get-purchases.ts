import getPool from "@cocalc/database/pool";
import {
  Service,
  MAX_API_LIMIT,
  Purchase,
} from "@cocalc/util/db-schema/purchases";

interface Options {
  account_id: string;
  limit?: number;
  offset?: number;
  paid?: boolean;
  service?: Service;
}

export default async function getPurchases({
  account_id,
  limit = 50,
  offset,
  paid,
  service,
}: Options): Promise<Partial<Purchase>[]> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool("medium");
  let query =
    "SELECT id, time, cost, service, description, invoice_id, paid, project_id FROM purchases WHERE account_id=$1";
  const params: any[] = [account_id];
  if (service != null) {
    params.push(service);
    query += ` AND service=$${params.length}`;
  }
  if (paid != null) {
    if (paid) {
      query += " AND paid IS true";
    } else {
      query += " AND (paid IS null OR paid IS false)";
    }
  }
  query += " ORDER BY time DESC";
  if (limit != null) {
    params.push(limit);
    query += ` limit $${params.length}`;
  }
  if (offset != null) {
    params.push(offset);
    query += ` offset $${params.length}`;
  }

  const { rows } = await pool.query(query, params);
  return rows;
}
