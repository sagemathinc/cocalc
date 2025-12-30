/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { is_array } from "@cocalc/util/misc";

// Convert timestamp fields as returned from postgresql queries
// into ms since the epoch, as a number.
export function toEpoch(
  rows: Record<string, unknown> | Record<string, unknown>[],
  fields: string[],
): void {
  const rowList = is_array(rows) ? rows : [rows];
  for (const row of rowList) {
    for (const field of fields) {
      const value = row[field];
      if (value) {
        row[field] = new Date(value as string | number | Date).valueOf();
      }
    }
  }
}
