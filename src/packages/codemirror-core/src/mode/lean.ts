/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

/*
This is just a first tiny quick step.  To finish this:

- Look at https://codemirror.net/demo/simplemode.html for how this works.
- Put everything from https://github.com/leanprover/vscode-lean/blob/master/syntaxes/lean.json in here.

playgroud to see the alternative of negative look ahead in action: https://regex101.com/r/lop9Se/1

*/

// This is redundant with the regexp's below, but we need this to do completions
// before the terms are ever used.
export const completions: string[] = "import|prelude|theory|definition|def|abbreviation|instance|renaming|hiding|exposing|parameter|parameters|begin|constant|constants|lemma|variable|variables|theorem|example|open|axiom|inductive|coinductive|with|structure|universe|universes|alias|precedence|reserve|postfix|prefix|infix|infixl|infixr|notation|end|using|namespace|section|local|set_option|extends|include|omit|class|classes|instances|raw|run_cmd|print|eval|reduce|check|help|exit|calc|have|this|match|do|suffices|show|by|in|at|let|forall|fun|exists|assume|from|Prop|Type|Sort".split(
  "|"
);
completions.sort();

(CodeMirror as any).defineSimpleMode("lean", {
  start: [
    { regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string" },
    { regex: /\/-/, token: "comment", next: "blockcomment" },
    {
      regex: /#(print|eval|reduce|check|help|exit)\b/,
      token: "variable-3",
    },
    { regex: /--.*/, token: "comment" },
    { regex: /[-+\/*=<>!]+/, token: "operator" },
    {
      regex: /((?!\.).{1}|^)\b(import|prelude|theory|definition|def|abbreviation|instance|renaming|hiding|exposing|parameter|parameters|begin|constant|constants|lemma|variable|variables|theorem|example|open|axiom|inductive|coinductive|with|structure|universe|universes|alias|precedence|reserve|postfix|prefix|infix|infixl|infixr|notation|end|using|namespace|section|local|set_option|extends|include|omit|class|classes|instances|raw|run_cmd)\b/,
      token: "keyword",
    },
    {
      regex: /((?!\.).{1}|^)\b(calc|have|this|match|do|suffices|show|by|in|at|let|forall|fun|exists|assume|from)\b/,
      token: "variable-2",
    },
    {
      regex: /\b(Prop|Type|Sort)\b/,
      token: "atom",
    },
    {
      regex: /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i,
      token: "number",
    },
    { regex: /\/-.*?-\//, token: "comment" },
    { regex: /begin/, indent: true },
    { regex: /end/, dedent: true },
    { regex: /[a-z$][\w$]*/, token: "variable" },
    { regex: /b?"/, token: "string", next: "string" },
  ],
  string: [
    { regex: /"/, token: "string", next: "start" },
    { regex: /(?:[^\\"]|\\(?:.|$))*/, token: "string" },
  ],
  blockcomment: [
    { regex: /.*?-\//, token: "comment", next: "start" },
    { regex: /.*/, token: "comment" },
  ],
  meta: {
    dontIndentStates: ["comment"],
    lineComment: "--",
  },
});
