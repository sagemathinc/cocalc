/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { cm_start_end } from "./util";

/*
The variable mode determines whether we are folding or unfolding *everything*
selected.  If mode='fold', fold everything; if mode='unfold', unfolding everything;
and if mode=undefined, not yet decided.  If undecided, which is decided on the first
thing that we would toggle, e.g., if the first fold point is unfolded, we make sure
everything is folded in all ranges, but if the first fold point is not folded, we then
make everything unfolded.
*/

CodeMirror.defineExtension("foldCodeSelectionAware", function (
  mode: undefined | "fold" | "unfold"
) {
  // @ts-ignore
  const editor: any = this;
  for (const selection of editor.listSelections()) {
    const { start_line, end_line } = cm_start_end(selection);
    for (let n = start_line; n <= end_line; n++) {
      const pos = CodeMirror.Pos(n);
      if (mode != null) {
        editor.foldCode(pos, null, mode);
      } else {
        // try to toggle and see if anything happens
        const is_folded = editor.isLineFolded(n);
        editor.foldCode(pos);
        if (editor.isLineFolded(n) !== is_folded) {
          // this is a foldable line, and what did we just do?  What it was, keep doing it.
          mode = editor.isLineFolded(n) ? "fold" : "unfold";
        }
      }
    }
  }
});

// This isFolded extension that comes with CodeMirror isn't useful for the above, since it
// is only at a *point*, not a line.
CodeMirror.defineExtension("isLineFolded", function (line: number): boolean {
  // @ts-ignore
  const editor: any = this;
  for (const mark of editor.findMarks(
    { line, ch: 0 },
    { line: line + 1, ch: 0 }
  )) {
    if (mark.__isFold) {
      return true;
    }
  }
  return false;
});
