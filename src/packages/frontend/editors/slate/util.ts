/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { capitalize, is_whitespace, replace_all } from "@cocalc/util/misc";

// Note: this markdown_escape is based on https://github.com/edwmurph/escape-markdown/blob/master/index.js

const MAP = {
  "*": "\\*",
  "+": "\\+",
  "-": "\\-",
  "#": "\\#",
  "(": "\\(",
  ")": "\\)",
  "[": "\\[",
  "]": "\\]",
  "|": "\\|",
  _: "\\_",
  "\\": "\\\\",
  "`": "\\`",
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "\xa0": "&nbsp;", // we do this so that the markdown nbsp's are explicit
  $: "\\$",
} as const;

export function markdownEscape(
  s: string,
  isFirstChild: boolean = false
): string {
  // The 1-character replacements we make in any text.
  s = s.replace(/[\*\(\)\[\]\+\-\\_`#<>]/g, (m) => MAP[m]);
  // Version of the above, but with some keys from the map purposely missing here,
  // since overescaping makes the generated markdown ugly.  However, sadly we HAVE
  // to escape everything (as above), since otherwise collaborative editing gets
  // broken.  E.g., User a types a single - at the beginning of the line, and user
  // B types something somewhere else in the document.  The dash then automatically
  // turns into a list without user A doing anything.  NOT good.
  // Fortunately, caching makes this less painful.
  // s = s.replace(/[\\_`<>$&\xa0|]/g, (m) => MAP[m]);

  // Links - we do this to avoid escaping [ and ] when not necessary.
  s = s.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (link) =>
    link.replace(/[\[\]]/g, (m) => MAP[m])
  );

  if (isFirstChild) {
    // Escape three dashes at start of line mod whitespace (which is hr).
    s = s.replace(/^\s*---/, (m) => m.replace("---", "\\-\\-\\-"));

    // Escape # signs at start of line (headers).
    s = s.replace(/^\s*#+/, (m) => replace_all(m, "#", "\\#"));
  }

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

/*
li_indent -- indent all but the first line by amount spaces.

NOTE: There are some cases where more than 2 spaces are needed.
For example, here we need 3:

1. one
2. two
   - foo
   - bar
*/
export function li_indent(s: string, amount: number = 2): string {
  const i = s.indexOf("\n");
  if (i != -1 && i != s.length - 1) {
    return s.slice(0, i + 1) + indent(s.slice(i + 1), amount);
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

export function ensure_ends_in_two_newline(s: string): string {
  if (s[s.length - 1] !== "\n") {
    return s + "\n\n";
  } else if (s[s.length - 2] !== "\n") {
    return s + "\n";
  } else {
    return s;
  }
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

function indexOfNonWhitespace(s: string): number {
  // regexp finds where the first non-whitespace starts
  return /\S/.exec(s)?.index ?? -1;
}

function lastIndexOfNonWhitespace(s: string): number {
  // regexp finds where the whitespace starts at the end of the string.
  return (/\s+$/.exec(s)?.index ?? s.length) - 1;
}

export function stripWhitespace(s: string): {
  before: string;
  trimmed: string;
  after: string;
} {
  const i = indexOfNonWhitespace(s);
  const j = lastIndexOfNonWhitespace(s);
  return {
    before: s.slice(0, i),
    trimmed: s.slice(i, j + 1),
    after: s.slice(j + 1),
  };
}

export function markInlineText(
  text: string,
  left: string,
  right?: string // defaults to left if not given
): string {
  // For non-HTML, we have to put the mark *inside* of any
  // whitespace on the outside.
  // See https://www.markdownguide.org/basic-syntax/#bold
  // where it says "... without spaces ...".
  // In particular, `** bold **` does NOT work.
  // This is NOT true for html, of course.
  if (left.indexOf("<") != -1) {
    // html - always has right set.
    return left + text + right;
  }
  const { before, trimmed, after } = stripWhitespace(text);
  if (trimmed.length == 0) {
    // all whitespace, so don't mark it.
    return text;
  }
  return `${before}${left}${trimmed}${right ?? left}${after}`;
}

export function padLeft(s: string, n: number): string {
  while (s.length < n) {
    s = " " + s;
  }
  return s;
}

export function padRight(s: string, n: number): string {
  while (s.length < n) {
    s += " ";
  }
  return s;
}

export function padCenter(s: string, n: number): string {
  while (s.length < n) {
    s = " " + s + " ";
  }
  return s.slice(0, n);
}

/* This focused color is "Jupyter notebook classic" focused cell green. */
//export const FOCUSED_COLOR = "#66bb6a";

//export const FOCUSED_COLOR = "#2196f3";
export const FOCUSED_COLOR = "rgb(126,182,226)";

export function string_to_style(style: string): any {
  const obj: any = {};
  for (const x of style.split(";")) {
    const j = x.indexOf("=");
    if (j == -1) continue;
    let key = x.slice(0, j);
    const i = key.indexOf("-");
    if (i != -1) {
      key = x.slice(0, i) + capitalize(x.slice(i + 1));
    }
    obj[key] = x.slice(j + 1);
  }
  return obj;
}

export const DEFAULT_CHILDREN = [{ text: "" }];

export function removeBlankLines(s: string): string {
  return s.replace(/^\s*\n/gm, "");
}
