/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
  return s.replace(/\*\\_`#<>$&]/g, (m) => MAP[m]);
}
