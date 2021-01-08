/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_whitespace } from "smc-util/misc";

// Note: this markdown_escape is based on https://github.com/edwmurph/escape-markdown/blob/master/index.js

// We do NOT escape []() since \[ \] and \( \) is used to delineate
// mathematics. Also escaping -/+ are used for simple math so don't
// escape.

const MAP = {
  "*": "\\*",
  "#": "\\#",
  _: "\\_",
  "\\": "\\\\",
  "`": "\\`",
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  $: "\\$",
} as const;

export function markdown_escape(s: string): string {
  return s.replace(/[\*\\_`#<>$&]/g, (m) => MAP[m]);
}

export function indent(s: string, n: number): string {
  if (n == 0) {
    return s;
  }
  let left = "";
  for (let i = 0; i < n; i++) {
    left += " ";
  }

  // add space at beginning of all non-whitespace lines
  const v = s.split("\n");
  for (let i = 0; i < v.length; i++) {
    if (!is_whitespace(v[i])) {
      v[i] = left + v[i];
    }
  }
  return v.join("\n");
}

export function li_indent(s: string): string {
  // indent all but the first line by 2.
  const i = s.indexOf("\n");
  if (i != -1 && i != s.length - 1) {
    return s.slice(0, i + 1) + indent(s.slice(i + 1), 2);
  } else {
    return s;
  }
}

export function ensure_ends_in_newline(s: string): string {
  if (s[s.length - 1] != "\n") {
    return s + "\n";
  } else {
    return s;
  }
}

export function markdown_quote(s: string): string {
  const v: string[] = [];
  for (const line of s.trim().split("\n")) {
    if (is_whitespace(line)) {
      v.push(">");
    } else {
      v.push("> " + line);
    }
  }
  return v.join("\n") + "\n\n";
}
