/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

type CountResultCallback = (err?: unknown, count?: number) => void;

/**
 * Returns a function that extracts a COUNT(*) result as a number.
 */
export function count_result(
  cb?: CountResultCallback,
): (
  err?: unknown,
  result?: { rows?: Array<{ count?: string | number }> },
) => void {
  if (cb == null) {
    return () => {};
  }
  return (err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(undefined, parseInt(result?.rows?.[0]?.count as string, 10));
  };
}
