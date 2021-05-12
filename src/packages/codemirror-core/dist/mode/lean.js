"use strict";
/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completions = void 0;
var CodeMirror = __importStar(require("codemirror"));
/*
This is just a first tiny quick step.  To finish this:

- Look at https://codemirror.net/demo/simplemode.html for how this works.
- Put everything from https://github.com/leanprover/vscode-lean/blob/master/syntaxes/lean.json in here.

playgroud to see the alternative of negative look ahead in action: https://regex101.com/r/lop9Se/1

*/
// This is redundant with the regexp's below, but we need this to do completions
// before the terms are ever used.
exports.completions = "import|prelude|theory|definition|def|abbreviation|instance|renaming|hiding|exposing|parameter|parameters|begin|constant|constants|lemma|variable|variables|theorem|example|open|axiom|inductive|coinductive|with|structure|universe|universes|alias|precedence|reserve|postfix|prefix|infix|infixl|infixr|notation|end|using|namespace|section|local|set_option|extends|include|omit|class|classes|instances|raw|run_cmd|print|eval|reduce|check|help|exit|calc|have|this|match|do|suffices|show|by|in|at|let|forall|fun|exists|assume|from|Prop|Type|Sort".split("|");
exports.completions.sort();
CodeMirror.defineSimpleMode("lean", {
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
