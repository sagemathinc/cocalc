/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";

// compareVersionStrings takes two strings "a","b"
// and returns 1 is "a" is bigger, 0 if they are the same, and -1 if "a" is smaller.
// By "bigger" we compare the integer and non-integer parts of the strings separately.
// Examples:
//     - "sage.10" is bigger than "sage.9" (because 10 > 9)
//     - "python.1" is bigger than "sage.9" (because "python" > "sage")
//     - "sage.1.23" is bigger than "sage.0.456" (because 1 > 0)
//     - "sage.1.2.3" is bigger than "sage.1.2" (because "." > "")
function compareVersionStrings(a: string, b: string): -1 | 0 | 1 {
  const av: string[] = a.split(/(\d+)/);
  const bv: string[] = b.split(/(\d+)/);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const l = av[i] ?? "";
    const r = bv[i] ?? "";
    if (/\d/.test(l) && /\d/.test(r)) {
      const vA = parseInt(l);
      const vB = parseInt(r);
      if (vA > vB) {
        return 1;
      }
      if (vA < vB) {
        return -1;
      }
    } else {
      if (l > r) {
        return 1;
      }
      if (l < r) {
        return -1;
      }
    }
  }
  return 0;
}

// Find the kernel whose name is closest to the given name.
export function closest_kernel_match(
  name: string,
  kernel_list: immutable.List<immutable.Map<string, string>>
): immutable.Map<string, string> {
  name = name.toLowerCase().replace("matlab", "octave");
  name = name === "python" ? "python3" : name;
  let bestValue = -1;
  let bestMatch: immutable.Map<string, string> | undefined = undefined;
  for (let i = 0; i < kernel_list.size; i++) {
    const k = kernel_list.get(i);
    if (k == null) {
      // This happened to Harald once when using the "mod sim py" custom image.
      continue;
    }
    // filter out kernels with negative priority (using the priority
    // would be great, though)
    if (k.getIn(["metadata", "cocalc", "priority"], 0) < 0) continue;
    const kernel_name = k.get("name")?.toLowerCase();
    if (!kernel_name) continue;
    let v = 0;
    for (let j = 0; j < name.length; j++) {
      if (name[j] === kernel_name[j]) {
        v++;
      } else {
        break;
      }
    }
    if (
      v > bestValue ||
      (v === bestValue &&
        bestMatch &&
        compareVersionStrings(k.get("name"), bestMatch.get("name")) === 1)
    ) {
      bestValue = v;
      bestMatch = k;
    }
  }
  if (bestMatch == null) {
    // should be impossible in practice since kernel_list is non-empty and so
    // on, but just in case...
    return kernel_list.get(0) ?? immutable.Map<string, string>();
  }
  return bestMatch;
}
