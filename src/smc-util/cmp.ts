/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Moment } from "moment";

export function cmp(a: any, b: any): number {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
}

/*
compare two Date | undefined | null objects.

null and undefined are considered equal to each other.

null_last:
  - true: nulls are infinitely in the future
  - false: nulls are the dawn of mankind
*/

export function cmp_Date(
  a: Date | undefined | null,
  b: Date | undefined | null,
  null_last = false
): -1 | 0 | 1 {
  if (a == null) {
    if (b == null) {
      return 0;
    }
    return null_last ? 1 : -1;
  }
  // a != null
  if (b == null) {
    return null_last ? -1 : 1;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0; // note: a == b for Date objects doesn't work as expected, but that's OK here.
}

export function cmp_moment(a?: Moment, b?: Moment, null_last = false) {
  return cmp_Date(a?.toDate(), b?.toDate(), null_last);
}

export function cmp_array(a, b): number {
  const end = Math.max(a.length, b.length);
  for (let i = 0; i < end; i++) {
    const c = cmp(a[i], b[i]);
    if (c) {
      return c;
    }
  }
  return 0;
}
