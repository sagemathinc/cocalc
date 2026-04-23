/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Classify a db.userQuery as read or write.
//
// This mirrors the logic in postgres-user-queries.coffee:
//   is_set_query = not misc.has_null_leaf(query)
//
// Read queries have at least one null leaf (the DB fills those in).
// Write queries have all non-null leaves (the DB updates those).

import { has_null_leaf } from "@cocalc/util/misc";

/**
 * Check if a single {table: value} query object is a write (set) operation.
 * Returns true if all leaf values are non-null (= UPDATE/INSERT).
 * Returns false if any leaf is null (= SELECT, nulls get filled).
 */
function isSingleQueryWrite(query: any): boolean {
  if (!query || typeof query !== "object") return false;
  const tableName = Object.keys(query)[0];
  if (!tableName) return false;
  let tableQuery = query[tableName];
  // Array: unwrap single element. For multi-element arrays, check each —
  // the DB layer treats them as writes if any element has no null leaf.
  if (Array.isArray(tableQuery)) {
    if (tableQuery.length === 1) {
      tableQuery = tableQuery[0];
    } else {
      // Multi-element: write if ANY element has all non-null leaves
      return tableQuery.some(
        (el: any) => typeof el === "object" && el != null && !has_null_leaf(el),
      );
    }
  }
  if (typeof tableQuery !== "object" || tableQuery == null) return false;
  return !has_null_leaf(tableQuery);
}

/**
 * Check if a db.userQuery payload contains any write operation.
 * The query can be a single {table: {...}} object or an array of
 * queries (batch). If ANY element in a batch is a write, the entire
 * batch is classified as a write.
 */
export function isUserQueryWrite(query: any): boolean {
  if (Array.isArray(query)) {
    return query.some(isSingleQueryWrite);
  }
  return isSingleQueryWrite(query);
}
