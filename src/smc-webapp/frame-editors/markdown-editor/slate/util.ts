/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_whitespace } from "smc-util/misc";

// Note: this markdown_escape is based on https://github.com/edwmurph/escape-markdown/blob/master/index.js

// We do NOT escape -/+ since they do not seem to cause any trouble (?).

const MAP = {
  "*": "\\*",
  "+": "\\+",
  "-": "\\-",
  "#": "\\#",
  "(": "\\(",
  ")": "\\)",
  "[": "\\[",
  "]": "\\]",
  _: "\\_",
  "\\": "\\\\",
  "`": "\\`",
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  $: "\\$",
} as const;

// Matches any markdown link.
const LINK = new RegExp(/\[([^\]]+)\]\(([^\)]+)\)/g);

export function markdown_escape(s: string): string {
  // some keys from the map above are purposely missing here, since overescaping
  // makes the generated markdown ugly.

  // The 1-character replacements we make in any text.
  s = s.replace(/[\\_`<>$&]/g, (m) => MAP[m]);

  // Links - we do this to avoid escaping [ and ] when not necessary.
  s = s.replace(LINK, (link) => link.replace(/[\[\]]/g, (m) => MAP[m]));

  return s;
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
  return mark_block(s, ">");
}

export function mark_block(s: string, mark: string): string {
  const v: string[] = [];
  for (const line of s.trim().split("\n")) {
    if (is_whitespace(line)) {
      v.push(mark);
    } else {
      v.push(mark + " " + line);
    }
  }
  return v.join("\n") + "\n\n";
}
