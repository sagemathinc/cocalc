/*
Does the queries to update changefeeds, deduplicating across
both all changefeeds and a small interval of time.
*/

import { callback } from "awaiting";

const { one_result, all_results } = require("../postgres-base");

import { PostgreSQL, QueryWhere } from "./types";

interface QueryOpts {
  db: PostgreSQL;
  select: string[];
  table: string;
  where: QueryWhere;
}

export async function query(opts: QueryOpts): Promise<any> {
  return await callback(
    all_query,
    opts.db,
    opts.select,
    opts.table,
    opts.where
  );
}

export async function query_one(opts: QueryOpts): Promise<any> {
  return await callback(
    one_query,
    opts.db,
    opts.select,
    opts.table,
    opts.where
  );
}

function all_query(db, select, table, where, cb): void {
  db._query({ select, table, where, cb: all_results(cb) });
}

function one_query(db, select, table, where, cb): void {
  db._query({ select, table, where, cb: one_result(cb) });
}
