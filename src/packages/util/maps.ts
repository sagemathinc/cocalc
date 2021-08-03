/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reduce } from "lodash";
import { is_array, is_object } from "./type-checking";

// compare the values in a map a by the values of b
// or just by b if b is a number, using func(a, b)
function map_comp_fn(func, fallback) {
  return (a, b) => {
    const c = {};
    if (typeof b === "number") {
      for (let k in a) {
        let v = a[k];
        c[k] = func(v, b);
      }
    } else {
      for (let k in a) {
        let v = a[k];
        c[k] = func(v, b[k] ?? fallback);
      }
    }
    return c;
  };
}

export const map_limit = map_comp_fn(Math.min, Number.MAX_VALUE);
export const map_min = map_limit;
export const map_max = map_comp_fn(Math.max, Number.MIN_VALUE);

// arithmetic sum of an array
export function sum(arr, start = 0) {
  if (start == null) {
    start = 0;
  }
  return reduce(arr, (a, b) => a + b, start);
}

// returns true if the given map is undefined or empty, or all the values are falsy
export function is_zero_map(map: undefined | null | object): boolean {
  if (map == null) {
    return true;
  }
  for (let k in map) {
    if (map[k]) {
      return false;
    }
  }
  return true;
}

// Returns copy of map with no undefined/null values (recursive).
// Doesn't modify map.  If map is an array, just returns it
// with no change even if it has undefined values.
export function map_without_undefined(map?: object): object | undefined | null {
  if (map == null) {
    return;
  }
  if (is_array(map)) {
    return map;
  }
  const new_map = {};
  for (let k in map) {
    const v = map[k];
    if (v == null) {
      continue;
    } else {
      new_map[k] = is_object(v) ? map_without_undefined(v) : v;
    }
  }
  return new_map;
}

// modify map in places deleting keys with null or undefined
// values; NOT recursive.
export function map_mutate_out_undefined(map: object): void {
  for (let k in map) {
    const v = map[k];
    if (v == null) {
      delete map[k];
    }
  }
}
