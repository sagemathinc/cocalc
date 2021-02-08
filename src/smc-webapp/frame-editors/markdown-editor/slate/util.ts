/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { capitalize, is_whitespace, replace_all } from "smc-util/misc";

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

export function markdownEscape(
  s: string,
  isFirstChild: boolean = false
): string {
  // some keys from the map above are purposely missing here, since overescaping
  // makes the generated markdown ugly.

  // The 1-character replacements we make in any text.
  s = s.replace(/[\\_`<>$&\u00A0|]/g, (m) => MAP[m]);

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
  // indent all but the first line by 4 spaces.
  // See https://stackoverflow.com/questions/53866598/markdown-list-indentation-with-3-spaces-or-4-spaces-what-is-the-standard#:~:text=So%20for%20ordered%20lists%2C%20you,hit%20the%20list%20marker%2010.
  const i = s.indexOf("\n");
  if (i != -1 && i != s.length - 1) {
    return s.slice(0, i + 1) + indent(s.slice(i + 1), 4);
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

export function replace_math(text, math) {
  // Replace all the math group placeholders in the text
  // with the saved strings.
  return text.replace(/`\uFE32\uFE33(\d+)\uFE32\uFE33`/g, function (_, n) {
    return math[n];
  });
}

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
