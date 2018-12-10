/*
Make it so Codemirror has an option to automatically close LaTeX environments.

Inspired a little bit by
  - https://codemirror.net/demo/closetag.html
  - https://codemirror.net/addon/edit/closetag.js
*/

import * as CodeMirror from "codemirror";

// This innerMode function is missing from the @types/codemirror official declarations.
// This is how to add a new missing declaration via "augmentation":
//   https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
declare module "codemirror" {
  function innerMode(mode: any, state: any): any;
}

import { splitlines } from "smc-util/misc2";

CodeMirror.defineOption("autoCloseLatex", false, function(cm, val, old) {
  if (old) {
    cm.removeKeyMap("autoCloseLatex");
  }
  if (!val) {
    return;
  }
  const map = {
    name: "autoCloseLatex",
    Enter: function(cm) {
      return auto_close_latex(cm);
    }
  };
  cm.addKeyMap(map);
});

interface Position {
  line: number;
  ch: number;
}

interface Selection {
  head: Position;
  anchor: Position;
}

function auto_close_latex(cm): void {
  if (cm.getOption("disableInput")) {
    return CodeMirror.Pass;
  }
  const replacements: string[] = [];
  const selections: Selection[] = [];
  let did_subs: boolean = false;
  let extra_lines: number = 0;

  const no_op = function(pos: Position): void {
    replacements.push("\n");
    const new_pos: Position = { line: pos.line + 1, ch: 0 };
    extra_lines += 1;
    selections.push({ head: new_pos, anchor: new_pos });
  };

  for (let range of cm.listSelections()) {
    if (!range.empty()) {
      // if any range is non-empty do nothing.
      return CodeMirror.Pass;
    }
    const pos: Position = range.head;
    const tok: CodeMirror.Token = cm.getTokenAt(pos);
    const inner = CodeMirror.innerMode(cm.getMode(), tok.state);
    if (inner.mode.name !== "stex") {
      no_op(pos);
      continue;
    }
    if (tok.type !== "bracket" && tok.string !== "}") {
      no_op(pos);
      continue;
    }
    const next_token: CodeMirror.Token = cm.getTokenAt({
      line: pos.line,
      ch: pos.ch + 1
    });
    if (next_token.start !== tok.start) {
      //has to be end of line.
      no_op(pos);
      continue;
    }

    const line: string = cm.getLine(pos.line);
    let i: number = line.lastIndexOf("\\begin{");
    if (i === -1) {
      no_op(pos);
      continue;
    }
    let environment: string = line.slice(i + "\\begin{".length, pos.ch - 1);
    i = environment.indexOf("}");
    if (i != -1) {
      environment = environment.slice(0, i);
    }
    const end: string = `\\end{${environment}}`;
    const s: string = cm.getRange(
      { line: pos.line + 1, ch: 0 },
      { line: pos.line + 1000, ch: 0 }
    );
    i = s.indexOf(`\\end{${environment}}`);
    const j: number = s.indexOf(`\\begin{${environment}}`);
    if (i !== -1 && (j === -1 || j > i)) {
      no_op(pos);
      continue;
    }
    const middle: string = extra_content(environment);
    replacements.push(`${middle}\n${end}\n`);
    const new_pos: Position = {
      line: pos.line + extra_lines + 1,
      ch: middle.length
    };
    extra_lines += splitlines(replacements[replacements.length - 1]).length + 1;
    selections.push({ head: new_pos, anchor: new_pos });
    did_subs = true;
  }

  if (did_subs) {
    // now make all the replacements
    cm.replaceSelections(replacements);
    // TODO: selections aren't quite right with multiple ones...
    cm.setSelections(selections);
  } else {
    return CodeMirror.Pass;
  }
}

// See http://latex.wikia.com/wiki/List_of_LaTeX_environments for inspiration.
var extra_content = function(environment: string): string {
  switch (environment) {
    case "enumerate":
    case "itemize":
    case "list":
      return "\n\\item First ";
    case "description":
      return "\n\\item [label] First  ";
    case "figure":
      return "\n% body of the figure\n\\caption{figure title}";
    default:
      return "\n";
  }
};
