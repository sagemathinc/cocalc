import { escapeIdentifier } from "pg";

import getPool from "@cocalc/database/pool";
import { SCHEMA } from "@cocalc/util/schema";

interface Opts {
  table: string;
  field: "project_id" | "account_id"; // for now, we only support a few
  value: string; // a UUID
  limit?: number;
}

type Ret = Promise<{
  rowsDeleted: number;
  durationS: number;
}>;

function deleteQuery(table: string, field: string) {
  const T = escapeIdentifier(table);
  const F = escapeIdentifier(field);

  return `
DELETE FROM ${T}
WHERE ${F} IN (
    SELECT ${F} FROM ${T} WHERE ${F} = $1 LIMIT $2
)
RETURNING 1
`;
}

export async function bulk_delete(opts: Opts): Ret {
  const { table, field, value } = opts;
  let { limit = 1000 } = opts;
  // assert table name is a key in SCHEMA
  if (!(table in SCHEMA)) {
    throw new Error(`table ${table} does not exist`);
  }

  const q = deleteQuery(table, field);
  console.log(q);
  console.log(opts);

  const pool = getPool();

  const start_ts = Date.now();
  let rowsDeleted = 0;

  while (true) {
    const t0 = Date.now();
    const ret = await pool.query(q, [value, limit]);
    const td = Date.now() - t0;
    rowsDeleted += ret.rowCount ?? 0;

    // adjust the limit
    const next = Math.round(
      td > 0.1 ? limit / 2 : td < 0.05 ? limit * 2 : limit,
    );
    limit = Math.max(1, Math.min(10000, next));

    // wait for a bit, but not more than 1 second ~ this aims for a max utilization of 10%
    const wait_ms = Math.min(1000, td * 10);
    await new Promise((done) => setTimeout(done, wait_ms));

    console.log(
      `loop: deleted ${ret.rowCount} | wait=${wait_ms} | limit=${limit}`,
    );

    if (ret.rowCount === 0) break;
  }

  const durationS = (Date.now() - start_ts) / 1000;
  return { durationS, rowsDeleted };
}
