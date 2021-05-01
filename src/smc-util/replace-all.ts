/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// see http://stackoverflow.com/questions/1144783/replacing-all-occurrences-of-a-string-in-javascript
export function replaceAll(s: string, search: string, replace: string): string {
  return s.split(search).join(replace);
}

// Similar to replaceAll, except it takes as input a function f, which
// returns what to replace the i-th copy of search in string with.
export function replaceAllFunction(
  s: string,
  search: string,
  f: (i: number) => string
): string {
  const v = s.split(search);
  const w: string[] = [];
  for (let i = 0; i < v.length; i++) {
    w.push(v[i]);
    if (i < v.length - 1) {
      w.push(f(i));
    }
  }
  return w.join("");
}
