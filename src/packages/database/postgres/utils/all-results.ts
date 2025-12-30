/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { copy } from "@cocalc/util/misc";

export type AllResultsPattern = string | undefined;

type AllResultsCallback = (err?: unknown, result?: unknown) => void;

/**
 * Returns a function that processes SQL query results.
 * Without a pattern, it returns copies of all rows.
 * With a string pattern, it returns an array of that field's values.
 */
export function all_results(
  pattern?: AllResultsPattern | AllResultsCallback,
  cb?: AllResultsCallback,
): (err?: unknown, result?: { rows?: Array<Record<string, unknown>> }) => void {
  if (cb == null && typeof pattern === "function") {
    cb = pattern;
    pattern = undefined;
  }
  if (cb == null) {
    return () => {};
  }
  return (err, result) => {
    if (err) {
      return cb(err);
    }
    const { rows } = result as { rows: Array<Record<string, unknown>> };
    if (pattern == null) {
      return cb(
        undefined,
        rows.map((row) => copy(row)),
      );
    }
    if (typeof pattern === "string") {
      return cb(
        undefined,
        rows.map((row) => row?.[pattern] ?? undefined),
      );
    }
    return cb(`unsupported pattern type '${typeof pattern}'`);
  };
}
