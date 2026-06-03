/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import lodash from "lodash";

// removes the field:null to reduce bandwidth usage
export function stripNullFields<T extends Record<string, unknown>>(
  rows: T[],
): T[] {
  return rows.map((row) => lodash.omitBy(row, lodash.isNull) as T);
}
