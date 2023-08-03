/*
Get statement of a given type for a single account_id.  Has paging.

Statements are always ordered by id descending, which is well defined
and ensures statements connect together properly, unlike if we 
order by time (what if two statements have the same time?).
*/
import getPool from "@cocalc/database/pool";
import { MAX_API_LIMIT } from "@cocalc/util/db-schema/purchases";
import type { Interval, Statement } from "@cocalc/util/db-schema/statements";

export default async function getStatements({
  account_id,
  limit = 100,
  offset,
  interval,
}: {
  account_id: string;
  limit: number;
  interval: Interval;
  offset?: number;
}): Promise<Statement[]> {
  if (limit > MAX_API_LIMIT || !limit) {
    throw Error(`limit must be specified and at most ${MAX_API_LIMIT}`);
  }
  const pool = getPool();
  let query =
    "SELECT id, time, balance, total_charges, num_charges, total_credits, num_credits FROM statements WHERE account_id=$1 AND interval=$2 ORDER BY id DESC";
  const params: (number | string)[] = [account_id, interval];
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
