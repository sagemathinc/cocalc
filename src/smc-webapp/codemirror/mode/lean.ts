import * as CodeMirror from "codemirror";

/*
This is just a first tiny quick step.  To finish this:

- Look at https://codemirror.net/demo/simplemode.html for how this works.
- Put everything from https://github.com/leanprover/vscode-lean/blob/master/syntaxes/lean.json in here.

NOTE(hsy): I think the alternative that works with safari is this negative look ahead

/((?!\.).{1}|^)\b(import|prelude|theory|definition|def|abbreviation|instance|renaming|hiding|exposing|parameter|parameters|begin|constant|constants|lemma|variable|variables|theorem|example|open|axiom|inductive|coinductive|with|structure|universe|universes|alias|precedence|reserve|postfix|prefix|infix|infixl|infixr|notation|end|using|namespace|section|local|set_option|extends|include|omit|class|classes|instances|raw|run_cmd)\b/gm

playgroud: https://regex101.com/r/lop9Se/1

*/

(CodeMirror as any).defineSimpleMode("lean", {
  start: [
    { regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string" },
    {
      regex: /#(print|eval|reduce|check|help|exit)\b/,
      token: "keyword"
    },
    {
      regex: /\b(?!\.)(import|prelude|theory|definition|def|abbreviation|instance|renaming|hiding|exposing|parameter|parameters|begin|constant|constants|lemma|variable|variables|theorem|example|open|axiom|inductive|coinductive|with|structure|universe|universes|alias|precedence|reserve|postfix|prefix|infix|infixl|infixr|notation|end|using|namespace|section|local|set_option|extends|include|omit|class|classes|instances|raw|run_cmd)\b/,
      token: "keyword"
    },
    {
      regex: /\b(?!\.)(calc|have|this|match|do|suffices|show|by|in|at|let|forall|fun|exists|assume|from)\b/,
      token: "keyword"
    },
    {
      regex: /\b(Prop|Type|Sort)\b/,
      token: "keyword"
    },
    {
      regex: /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i,
      token: "number"
    },
    { regex: /--.*/, token: "comment" },
    { regex: /[-+\/*=<>!]+/, token: "operator" },
    { regex: /begin/, indent: true },
    { regex: /end/, dedent: true },
    { regex: /[a-z$][\w$]*/, token: "variable" }
  ],
  string: [
    { regex: /"/, token: "string", next: "start" },
    { regex: /(?:[^\\"]|\\(?:.|$))*/, token: "string" }
  ],
  comment: [{ regex: /\(-.*-\)/, token: "comment", next: "start" }],
  meta: {
    dontIndentStates: ["comment"],
    /* electricInput: /^\s*\}$/, */
    blockCommentStart: "(-",
    blockCommentEnd: "-)",
    lineComment: "--"
  }
});
