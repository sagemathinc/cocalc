/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * license
 */

import { replaceAll } from "./replace-all";

const escape_map = "$";

// We used to do this since we wanted to support math delineated by \[ ... \];
// however, that just conflicts too much with markdown itself and Jupyter classic
// doesn't do it.  Use $ only.
//const escape_map = "$()[]";

const unescape_map =
  "\uFE22\uFE23\uFE24\uFE25\uFE26"; /* we just use some unallocated unicode... */

export function math_escape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = replaceAll(s, "\\" + escape_map[i], unescape_map[i]);
  }
  return s;
}

export function math_unescape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = replaceAll(s, unescape_map[i], "\\" + escape_map[i]);
  }
  return s;
}
