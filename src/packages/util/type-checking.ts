/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export function is_array(obj: any): obj is any[] {
  return Object.prototype.toString.call(obj) === "[object Array]";
}

export function is_integer(obj: any): obj is number {
  return Number.isInteger?.(obj) ?? (typeof obj === "number" && obj % 1 === 0);
}

export function is_string(obj: any): obj is string {
  return typeof obj === "string";
}

// An object -- this is more constraining that typeof(obj) == 'object', e.g., it does
// NOT include Date.
export function is_object(obj: any): obj is object {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

export function is_date(obj: any): obj is Date {
  return obj instanceof Date;
}

export function is_set(obj: any): obj is Set<any> {
  return Object.prototype.toString.call(obj) === "[object Set]";
}
