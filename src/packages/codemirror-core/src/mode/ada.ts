/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

// Little first step for Ada

// This is redundant with the regexp's below, but we need this to do completions
// before the terms are ever used.
export const completions: string[] = "abort|else|new|return|abs|elsif|not|reverse|abstract|end|null|accept|entry|select|access|exception|of|separate|aliased|exit|or|some|all|others|subtype|and|for|out|synchronized|array|function|overriding|at|tagged|generic|package|task|begin|goto|pragma|terminate|body|private|then|if|procedure|type|case|in|protected|constant|interface|until|is|raise|use|declare|range|delay|limited|record|when|delta|loop|rem|while|digits|renames|with|do|mod|requeue|xor".split(
  "|"
);
completions.sort();

(CodeMirror as any).defineSimpleMode("ada", {
  start: [
    { regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string" },
    { regex: /--.*/, token: "comment" },
    { regex: /[-+\/*=<>!:]+/, token: "operator" },
    {
      regex: /\b(abort|else|new|return|abs|elsif|not|reverse|abstract|end|null|accept|entry|select|access|exception|of|separate|aliased|exit|or|some|all|others|subtype|and|for|out|synchronized|array|function|overriding|at|tagged|generic|package|task|begin|goto|pragma|terminate|body|private|then|if|procedure|type|case|in|protected|constant|interface|until|is|raise|use|declare|range|delay|limited|record|when|delta|loop|rem|while|digits|renames|with|do|mod|requeue|xor)\b/,
      token: "atom",
    },
    {
      regex: /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i,
      token: "number",
    },
    { regex: /(if|elseif|case|when|begin|while|loop)/, indent: true },
    { regex: /(end)/, dedent: true },
    {
      regex: /\b([A-Za-z_0-9]+)\b/,
      token: "variable-3",
    },
    { regex: /b?"/, token: "string", next: "string" },
  ],
  string: [
    { regex: /"/, token: "string", next: "start" },
    { regex: /(?:[^\\"]|\\(?:.|$))*/, token: "string" },
  ],
  meta: {
    dontIndentStates: ["comment"],
    lineComment: "--",
  },
});
