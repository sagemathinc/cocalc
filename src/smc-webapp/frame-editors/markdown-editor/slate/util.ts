/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_whitespace } from "smc-util/misc";

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
  $: "\\$",
} as const;

export function markdown_escape(s: string): string {
  // some keys from the map above are purposely missing here, since overescaping
  // makes the generated markdown ugly.

  // The 1-character replacements we make in any text.
  s = s.replace(/[\\_`<>$&|]/g, (m) => MAP[m]);

  // Links - we do this to avoid escaping [ and ] when not necessary.
  s = s.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (link) =>
    link.replace(/[\[\]]/g, (m) => MAP[m])
  );

  // Escape multiple spaces in a row so they don't just collapse to one space.
  s = s.replace(/\s+/g, escape_whitespace);

  return s;
}

// The input string s consists of 1 or more whitespace characters.
// The output is escaped so the whitespace from *spaces* is preserved
// be making all but the first space be a non breaking space in the
// text document.  We use *unicode* rather than &nbsp; so that it is
// rendered like a space in codemirror.  See
//    https://stackoverflow.com/questions/6046263/how-to-indent-a-few-lines-in-markdown-markup/53112628#53112628
function escape_whitespace(s: string): string {
  let t = s[0];
  for (let i = 1; i < s.length; i++) {
    t += s[i] == " " ? "\u00a0" : s[i];
  }
  return t;
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

function indexOfNonWhitespace(s: string): number {
  // regexp finds where the first non-whitespace starts
  return /\S/.exec(s)?.index ?? -1;
}

function lastIndexOfNonWhitespace(s: string): number {
  // regexp finds where the whitespace starts at the end of the string.
  return (/\s+$/.exec(s)?.index ?? s.length) - 1;
}

export function stripWhitespace(
  s: string
): { before: string; trimmed: string; after: string } {
  const i = indexOfNonWhitespace(s);
  const j = lastIndexOfNonWhitespace(s);
  return {
    before: s.slice(0, i),
    trimmed: s.slice(i, j + 1),
    after: s.slice(j + 1),
  };
}

export function mark_inline_text(
  text: string,
  left: string,
  right?: string // defaults to left if not given
): string {
  // We have to put the mark *inside* of any whitespace on the outside.
  // See https://www.markdownguide.org/basic-syntax/#bold
  // where it says "... without spaces ...".
  // In particular, `** bold **` does NOT work.
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
  return s;
}
