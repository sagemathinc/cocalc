/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Postgres 14 is different than 13 an earlier.
// extract(epoch from timestamp) returns a "numeric", which is converted to a string by the pg driver.
// we convert this explicitly to a floating point number to get the ms since epoch.
// Note: JavaScript's new Date(...) has no hesitation converting from a float.
export function timeInSeconds(field: string, asField?: string): string {
  return ` (EXTRACT(EPOCH FROM ${field})*1000)::FLOAT as ${asField ?? field} `;
}

// Given number of seconds **in the future**.
export function expireTime(ttl_s: number = 0): Date {
  return new Date(new Date().valueOf() + ttl_s * 1000);
}
