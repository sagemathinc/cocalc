import { escapeIdentifier } from "pg";

import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import getPool from "@cocalc/database/pool";
import { SCHEMA } from "@cocalc/util/schema";

const log = getLogger("db:bulk-delete");
const D = log.debug;

type Field =
  | "project_id"
  | "account_id"
  | "target_project_id"
  | "source_project_id";

const MAX_UTIL_PCT = envToInt("COCALC_DB_BULK_DELETE_MAX_UTIL_PCT", 10);
// adjust the time limits: by default, we aim to keep the operation between 0.1 and 0.2 secs
const MAX_TIME_TARGET_MS = envToInt(
  "COCALC_DB_BULK_DELETE_MAX_TIME_TARGET_MS",
  100,
);
const MAX_TARGET_S = MAX_TIME_TARGET_MS / 1000;
const MIN_TARGET_S = MAX_TARGET_S / 2;
const DEFAULT_LIMIT = envToInt("COCALC_DB_BULK_DELETE_DEFAULT_LIMIT", 16);
const MAX_LIMIT = envToInt("COCALC_DB_BULK_DELETE_MAX_LIMIT", 32768);

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

export async function bulkDelete(opts: Opts): Ret {
  const { table, field, value, id = "id", maxUtilPct = MAX_UTIL_PCT } = opts;
  let { limit = DEFAULT_LIMIT } = opts;
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

    const next =
      dt > MAX_TARGET_S ? limit / 2 : dt < MIN_TARGET_S ? limit * 2 : limit;
    limit = Math.max(1, Math.min(MAX_LIMIT, Math.round(next)));

    // wait for a bit, but not more than 1 second ~ this aims for a max utilization of 10%
    const waitS = Math.min(1, dt * ((100 - maxUtilPct) / maxUtilPct));
    await new Promise((done) => setTimeout(done, 1000 * waitS));
    totalWaitS += waitS;

    D(`deleted ${ret.rowCount} | dt=${dt} | wait=${waitS} | limit=${limit}`);

    if (ret.rowCount === 0) break;
  }

  const durationS = (Date.now() - start_ts) / 1000;
  return { durationS, rowsDeleted, totalWaitS, totalPgTimeS };
}
