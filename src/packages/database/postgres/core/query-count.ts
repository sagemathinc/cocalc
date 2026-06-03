/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - COUNT Wrapper

TypeScript implementation of _count method for simplified COUNT(*) queries.

Based on postgres-base.coffee lines 804-812
*/

import type { PostgreSQL, QueryWhere } from "../types";
import type { CB } from "@cocalc/util/types/callback";
import { count_result } from "../utils/count-result";

interface CountOptions {
  table: string;
  where?: QueryWhere;
  cb: CB<number>;
}

/**
 * Count entries in a table
 *
 * Special case of _query for counting entries with optional WHERE clause.
 *
 * @param db - PostgreSQL database instance
 * @param opts - Count options (table, optional where, callback)
 */
export function count(db: PostgreSQL, opts: CountOptions): void {
  db._query({
    query: `SELECT COUNT(*) FROM ${opts.table}`,
    where: opts.where,
    cb: count_result(opts.cb),
  });
}
