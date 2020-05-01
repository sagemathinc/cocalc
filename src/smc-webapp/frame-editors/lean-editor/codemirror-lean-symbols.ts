/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Make it so Codemirror has an option to insert LEAN symbols
*/

import { substitute_symbols } from "./symbols";

import * as CodeMirror from "codemirror";
declare module "codemirror" {
  function innerMode(mode: any, state: any): any;
}

CodeMirror.defineOption("leanSymbols", false, function (cm, val, old) {
  if (old) {
    cm.removeKeyMap("leanSymbols");
    cm.off("mousedown", lean_symbols);
    cm.off("blur", lean_symbols);
  }
  if (!val) {
    return;
  }
  const map = {
    name: "leanSymbols",
    Enter: lean_symbols,
    Space: lean_symbols,
    Tab: lean_symbols,
    Right: lean_symbols,
    Up: lean_symbols,
    Down: lean_symbols,
    "\\": lean_symbols,
  };
  cm.on("mousedown", lean_symbols);
  cm.on("blur", lean_symbols);
  cm.addKeyMap(map);
});

/*
interface Position {
  line: number;
  ch: number;
}

interface Selection {
  head: Position;
  anchor: Position;
}
*/

function lean_symbols(cm): any {
  if (cm.getOption("disableInput")) {
    return CodeMirror.Pass;
  }
  for (const range of cm.listSelections()) {
    const line = range.head.line;
    for (const sub of substitute_symbols(cm.getLine(line))) {
      const { replacement, from, to } = sub;
      cm.replaceRange(
        replacement,
        { line: line, ch: from },
        { line: line, ch: to }
      );
    }
  }
  return CodeMirror.Pass;
}
