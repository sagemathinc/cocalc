/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Nice async/await interface to doing basic queries.

import { callback } from "awaiting";

import { one_result } from "./utils/one-result";
import { all_results } from "./utils/all-results";

import { PostgreSQL, QueryWhere } from "./types";

interface QueryOpts {
  db: PostgreSQL;
  query?: string;
  select?: string[];
  set?: { [key: string]: any };
  jsonb_set?: object;
  jsonb_merge?: object;
  table?: string;
  where?: QueryWhere;
  one?: boolean; // if true get back one result; if false get list of all results.
  order_by?: string;
  limit?: number;
  params?: any[];
  timeout_s?: number;
}

export async function query(opts: QueryOpts): Promise<any> {
  return await callback(
    opts.one ? one_query : all_query,
    opts.db,
    opts.select,
    opts.table,
    opts.where,
    opts.set,
    opts.query,
    opts.jsonb_set,
    opts.jsonb_merge,
    opts.order_by,
    opts.limit,
    opts.params,
    opts.timeout_s,
  );
}

function all_query(
  db,
  select,
  table,
  where,
  set,
  query,
  jsonb_set,
  jsonb_merge,
  order_by,
  limit,
  params,
  timeout_s,
  cb,
): void {
  db._query({
    select,
    table,
    where,
    set,
    query,
    jsonb_set,
    jsonb_merge,
    order_by,
    limit,
    params,
    timeout_s,
    cb: all_results(cb),
  });
}

function one_query(
  db,
  select,
  table,
  where,
  set,
  query,
  jsonb_set,
  jsonb_merge,
  order_by,
  limit,
  params,
  timeout_s,
  cb,
): void {
  db._query({
    select,
    table,
    where,
    set,
    query,
    jsonb_set,
    jsonb_merge,
    order_by,
    limit,
    params,
    timeout_s,
    cb: one_result(cb),
  });
}
