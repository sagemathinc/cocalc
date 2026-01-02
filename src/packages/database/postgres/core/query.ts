/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - _query

TypeScript implementation of the _query method, which builds and executes
SQL queries with optional helpers (select, where, values, set, etc).
*/

import type { PostgreSQL, QueryOptions } from "../types";

/**
 * Execute a query with optional query builder inputs.
 *
 * @param opts.query Explicit SQL query string. When omitted, query is built
 *   from `table` + `select`/`where`/`set`/`values`/etc.
 * @param opts.select Columns to select when building a SELECT (string or array).
 * @param opts.table Table name when building a query without explicit SQL.
 * @param opts.params Parameters array for SQL placeholders.
 * @param opts.cache Cache results briefly for repeated identical queries.
 * @param opts.where WHERE clause builder: string, array of strings, or map of
 *   conditions using `$` placeholders. Undefined values are ignored.
 * @param opts.set UPDATE SET clause builder; same format as `values`.
 * @param opts.values INSERT VALUES builder; map of fields to values, supports
 *   optional `::type` annotations. Undefined fields are ignored, null becomes
 *   SQL NULL.
 * @param opts.conflict ON CONFLICT clause builder. Requires `values` and
 *   either a conflict field/fields or a full "ON CONFLICT ..." string.
 * @param opts.jsonb_set JSONB field updates with nested set/delete semantics.
 * @param opts.jsonb_merge Like jsonb_set, but merges nested objects instead of
 *   overwriting.
 * @param opts.order_by ORDER BY clause; rejects apostrophes to reduce injection risk.
 * @param opts.limit LIMIT clause; must be a non-negative integer.
 * @param opts.offset OFFSET clause; must be a non-negative integer.
 * @param opts.safety_check Enable the UPDATE/DELETE safety guard.
 * @param opts.retry_until_success Retry options passed to misc.retry_until_success.
 * @param opts.pg_params PostgreSQL parameters to set locally within a transaction.
 * @param opts.timeout_s Statement timeout override (seconds).
 * @param opts.cb Callback invoked with (err, result).
 */
export function query(db: PostgreSQL, opts: QueryOptions): void {
  const normalized = opts ?? {};
  normalized.params ??= [];
  normalized.cache ??= false;
  normalized.safety_check ??= true;
  opts = normalized;

  // quick check for write query against read-only connection
  if (
    db.is_standby &&
    (opts.set != null || opts.jsonb_set != null || opts.jsonb_merge != null)
  ) {
    if (typeof opts.cb === "function") {
      opts.cb("set queries against standby not allowed");
    }
    return;
  }

  if (opts.retry_until_success) {
    db._query_retry_until_success(opts);
    return;
  }

  if (!db.is_connected()) {
    const dbg = db._dbg("_query");
    dbg("connecting first...");
    // 2022-06: below there was {max_time: 45000} set with the note
    // "don't try forever; queries could pile up."
    // but I think this is rather harmful, since the hub could stop
    // trying to connect to the database altogether.
    // Rather, hub/health-checks::checkDBConnectivity will
    // mark the hub as being bad if it can't connect to the database.
    return db.connect({
      cb: (err) => {
        if (err) {
          dbg(`FAILED to connect -- ${err}`);
          return typeof opts.cb === "function"
            ? opts.cb("database is down (please try later)")
            : undefined;
        } else {
          dbg("connected, now doing query");
          return db.__do_query(opts);
        }
      },
    });
  } else {
    return db.__do_query(opts);
  }
}
