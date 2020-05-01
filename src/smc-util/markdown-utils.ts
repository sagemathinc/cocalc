/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * license
 */

// The markdown processor markedown-it seems to escape
// a bunch of characters that are relevant to later mathjax
// processing.  This is annoying, violates the Markdown spec
// (https://daringfireball.net/projects/markdown/syntax#backslash),
// and breaks things.  So we remove them first.

const { replace_all } = require("./misc");

const escape_map = "$()[]";
const unescape_map =
  "\uFE22\uFE23\uFE24\uFE25\uFE26"; /* we just use some unallocated unicode... */

export function math_escape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = replace_all(s, "\\" + escape_map[i], unescape_map[i]);
  }
  return s;
}

export function math_unescape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = replace_all(s, unescape_map[i], "\\" + escape_map[i]);
  }
  return s;
}
