/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { filter, first, map, contains } from "underscore";

// escape everything in a regex
function escapeRegExp(str: string): string {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}
// smiley-fication of an arbitrary string

const smileys_definition: (
  | [string, string]
  | [string, string, null, string]
  | [string, string, string, string]
)[] = [
  [":-)", "😁"],
  [":-(", "😞"],
  ["<3", "♡", null, "\\b"],
  [":shrug:", "¯\\\\_(ツ)_/¯"],
  ["o_o", "סּ_סּ", "\\b", "\\b"],
  [":-p", "😛", null, "\\b"],
  [">_<", "😆"],
  ["^^", "😄", "^", "S"],
  ["^^ ", "😄 "],
  [" ^^", " 😄"],
  [";-)", "😉"],
  ["-_-", "😔"],
  [":-\\", "😏"],
  [":omg:", "😱"],
];

const smileys: [RegExp, string][] = [];

for (let smiley of smileys_definition) {
  if (typeof smiley[0] != "string") continue;
  let s: string = escapeRegExp(smiley[0]);
  if (smiley[2] != null) {
    s = smiley[2] + s;
  }
  if (smiley[3] != null) {
    s = s + smiley[3];
  }
  smileys.push([RegExp(s, "g"), smiley[1]]);
}

export function smiley(opts: { s: string; wrap?: [string, string] }): string {
  // de-sanitize possible sanitized characters
  let s = opts.s.replace(/&gt;/g, ">").replace(/&lt;/g, "<");
  for (let subs of smileys) {
    let repl = subs[1];
    if (opts.wrap) {
      repl = opts.wrap[0] + repl + opts.wrap[1];
    }
    s = s.replace(subs[0], repl);
  }
  return s;
}

export function smiley_strings(): string[] {
  return filter(
    map(smileys_definition, first),
    (x) => !contains(["^^ ", " ^^"], x)
  );
}
