/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - _query_retry_until_success

TypeScript implementation of the retry wrapper for _query.
*/

import * as misc from "@cocalc/util/misc";

import type { PostgreSQL, QueryOptions } from "../types";

export function queryRetryUntilSuccess(
  db: PostgreSQL,
  opts: QueryOptions,
): void {
  const retry_opts = opts.retry_until_success;
  const orig_cb = opts.cb;
  delete opts.retry_until_success;

  // f just calls _do_query, but with a different cb (same opts)
  let args: [unknown, unknown] | undefined;
  const f = (cb) => {
    opts.cb = (err, result) => {
      args = [err, result];
      return cb(err);
    };
    return db._query(opts);
  };

  retry_opts.f = f;
  // When misc.retry_until_success finishes, it calls this, which just
  // calls the original cb.
  retry_opts.cb = (err) => {
    if (err) {
      return typeof orig_cb === "function" ? orig_cb(err) : undefined;
    } else {
      if (typeof orig_cb === "function") {
        return args ? orig_cb(args[0] as any, args[1] as any) : orig_cb();
      }
      return undefined;
    }
  };

  // OK, now start it attempting.
  return misc.retry_until_success(retry_opts);
}
