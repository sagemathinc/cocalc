// Get all subscriptions for a single account_id.
import getPool from "@cocalc/database/pool";
import { MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";

export default async function getSubscriptions({
  account_id,
  limit = 100,
  offset,
}: {
  account_id: string;
  limit?: number;
  offset?: number;
}): Promise<Subscription[]> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool(); // don't cache, e.g., frontend calls this right after paying for subscription and want to see change.
  let query =
    "SELECT id, account_id, created, cost, interval, current_period_start, current_period_end, latest_purchase_id, status, metadata, payment FROM subscriptions WHERE account_id=$1";
  const params: any[] = [account_id];
  query += " ORDER BY id DESC";
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
