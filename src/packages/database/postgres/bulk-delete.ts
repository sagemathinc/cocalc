import { escapeIdentifier } from "pg";

import getPool from "@cocalc/database/pool";
import { SCHEMA } from "@cocalc/util/schema";

type Field =
  | "project_id"
  | "account_id"
  | "target_project_id"
  | "source_project_id";

interface Opts {
  table: string; // e.g. project_log, etc.
  field: Field; // for now, we only support a few
  id?: string; // default "id", the ID field in the table, which identifies each row uniquely
  value: string; // a UUID
  limit?: number; // default 1024
  maxUtilPct?: number; // 0-100, percent
}

type Ret = Promise<{
  rowsDeleted: number;
  durationS: number;
  totalWaitS: number;
  totalPgTimeS: number;
}>;

function deleteQuery(table: string, field: string, id: string) {
  const T = escapeIdentifier(table);
  const F = escapeIdentifier(field);
  const ID = escapeIdentifier(id);

  return `
DELETE FROM ${T}
WHERE ${ID} IN (
    SELECT ${ID} FROM ${T} WHERE ${F} = $1 LIMIT $2
)`;
}

export async function bulk_delete(opts: Opts): Ret {
  const { table, field, value, id = "id", maxUtilPct = 10 } = opts;
  let { limit = 1024 } = opts;
  // assert table name is a key in SCHEMA
  if (!(table in SCHEMA)) {
    throw new Error(`table ${table} does not exist`);
  }

  if (maxUtilPct < 1 || maxUtilPct > 99) {
    throw new Error(`maxUtilPct must be between 1 and 99`);
  }

  const q = deleteQuery(table, field, id);
  const pool = getPool();
  const start_ts = Date.now();

  let rowsDeleted = 0;
  let totalWaitS = 0;
  let totalPgTimeS = 0;
  while (true) {
    const t0 = Date.now();
    const ret = await pool.query(q, [value, limit]);
    const dt = (Date.now() - t0) / 1000;
    rowsDeleted += ret.rowCount ?? 0;
    totalPgTimeS += dt;

    // adjust the limit: we aim to keep the operation between 0.1 and 0.2 secs
    const next = dt > 0.2 ? limit / 2 : dt < 0.1 ? limit * 2 : limit;
    limit = Math.max(1, Math.min(32768, Math.round(next)));

    // wait for a bit, but not more than 1 second ~ this aims for a max utilization of 10%
    const waitS = Math.min(1, dt * ((100 - maxUtilPct) / maxUtilPct));
    await new Promise((done) => setTimeout(done, 1000 * waitS));
    totalWaitS += waitS;

    // console.log(
    //   `deleted ${ret.rowCount} | dt=${dt} | wait=${waitS} | limit=${limit}`,
    // );

    if (ret.rowCount === 0) break;
  }

  const durationS = (Date.now() - start_ts) / 1000;
  return { durationS, rowsDeleted, totalWaitS, totalPgTimeS };
}
