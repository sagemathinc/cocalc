import { escapeIdentifier } from "pg";

import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import getPool from "@cocalc/database/pool";
import { SCHEMA } from "@cocalc/util/schema";

const log = getLogger("db:bulk-delete");
const D = log.debug;

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
// wait cap between chunks, in seconds. With MAX_TIME_TARGET_MS=100ms and 10% util
// the expected wait is ~0.9s, so this cap only bites when chunks overrun.
const MAX_WAIT_S = envToInt("COCALC_DB_BULK_DELETE_MAX_WAIT_S", 30);

interface BulkDeleteOpts {
  table: string; // e.g. project_log, etc.
  field: string; // column used in WHERE {field} = value (e.g. project_id, string_id)
  id?: string; // default "id"; the column used in the "WHERE {id} IN (...)" subselect.
  // For tables with a compound primary key, pass "ctid" to chunk by physical row id.
  value: string; // a UUID (or any scalar)
  limit?: number;
  maxUtilPct?: number;
}

export interface ChunkStats {
  rowsDeleted: number;
  durationS: number;
  totalWaitS: number;
  totalPgTimeS: number;
}

interface ThrottledRunnerOpts {
  limit?: number;
  maxUtilPct?: number;
  label?: string;
}

/**
 * Run `fn(limit)` repeatedly in chunks, adapting the limit so each call lands
 * in [MIN_TARGET_S, MAX_TARGET_S] and waiting between calls to keep total DB
 * utilization at `maxUtilPct`%. Stops when `fn` reports 0 rows affected.
 * Shared throttling primitive for bulk DELETE / UPDATE loops.
 */
export async function throttledRunner(
  fn: (limit: number) => Promise<number>,
  opts: ThrottledRunnerOpts = {},
): Promise<ChunkStats> {
  const maxUtilPct = opts.maxUtilPct ?? MAX_UTIL_PCT;
  if (maxUtilPct < 1 || maxUtilPct > 99) {
    throw new Error(`maxUtilPct must be between 1 and 99`);
  }
  let limit = opts.limit ?? DEFAULT_LIMIT;
  const label = opts.label ?? "throttled";

  const start_ts = Date.now();
  let rowsDeleted = 0;
  let totalWaitS = 0;
  let totalPgTimeS = 0;
  while (true) {
    const t0 = Date.now();
    const rowCount = await fn(limit);
    const dt = (Date.now() - t0) / 1000;
    rowsDeleted += rowCount;
    totalPgTimeS += dt;

    const next =
      dt > MAX_TARGET_S ? limit / 2 : dt < MIN_TARGET_S ? limit * 2 : limit;
    limit = Math.max(1, Math.min(MAX_LIMIT, Math.round(next)));

    // Target `maxUtilPct`% DB utilization. Adaptive limit above keeps dt near
    // MAX_TARGET_S, so the wait is typically ~0.9s at 10%. The cap only bites
    // when a chunk overruns its target (e.g. lock wait) — then we want to back
    // off, not keep hammering, so MAX_WAIT_S is generous (30s by default).
    const waitS = Math.min(MAX_WAIT_S, dt * ((100 - maxUtilPct) / maxUtilPct));
    if (waitS > 0) {
      await new Promise((done) => setTimeout(done, 1000 * waitS));
    }
    totalWaitS += waitS;

    D(`${label}: affected=${rowCount} | dt=${dt} | wait=${waitS} | limit=${limit}`);

    if (rowCount === 0) break;
  }

  const durationS = (Date.now() - start_ts) / 1000;
  return { durationS, rowsDeleted, totalWaitS, totalPgTimeS };
}

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

export async function bulkDelete(opts: BulkDeleteOpts): Promise<ChunkStats> {
  const { table, field, value, id = "id" } = opts;
  if (!(table in SCHEMA)) {
    throw new Error(`table ${table} does not exist`);
  }

  const q = deleteQuery(table, field, id);
  const pool = getPool();

  return throttledRunner(
    async (limit) => {
      const ret = await pool.query(q, [value, limit]);
      return ret.rowCount ?? 0;
    },
    {
      limit: opts.limit,
      maxUtilPct: opts.maxUtilPct,
      label: `bulkDelete ${table}.${field}`,
    },
  );
}
