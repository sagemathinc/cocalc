/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { cm_start_end } from "./util";

/*
Format the selected block (or blocks) of text, so it looks like this:
   stuff  : 'abc'
   foo    : 1
   more_0 : 'blah'
Or
   stuff  = 'abc'
   foo    = 1
   more_0 = 'blah'
The column separate is the first occurence in the first line of
one of '=' or ':'.  Selected lines that don't contain either symbol
are ignored.

NOTE: This is a nonstandard extension motivated mostly by coffeescript.
**Thus consider it on the way to being deprecated.**  Prettier and its
ilk solves the same sort of problem for all the languages we plan to
use longterm in a vastly better way.
*/

CodeMirror.defineExtension("align_assignments", function () {
  // @ts-ignore
  const cm : any = this;
  for (let sel of cm.listSelections()) {
    const { start_line, end_line } = cm_start_end(sel);
    let symbol: string | undefined = undefined;
    let column = 0;
    // first pass -- figure out what the symbol is and what column we will move it to.
    for (let n = start_line; n <= end_line; n++) {
      const x = cm.getLine(n);
      if (symbol == null) {
        // we still don't know what the separate symbol is.
        if (x.indexOf(":") != -1) {
          symbol = ":";
        } else if (x.indexOf("=") != -1) {
          symbol = "=";
        }
      }
      let i = x.indexOf(symbol);
      if (i === -1) {
        continue; // no symbol in this line, so skip
      }
      // reduce i until x[i-1] is NOT whitespace.
      while (i > 0 && x[i - 1].trim() === "") {
        i -= 1;
      }
      i += 1;
      column = Math.max(i, column);
    }
    if (symbol == null || !column) {
      continue; // no symbol in this selection, or no need to move it.  Done.
    }
    // second pass -- move symbol over by inserting space
    for (let n = start_line; n <= end_line; n++) {
      const x = cm.getLine(n);
      const i = x.indexOf(symbol);
      if (i !== -1) {
        // There is a symbol in this line -- put it in the spot where we want it.
        if (i < column) {
          // symbol is too early -- add space
          // column - i spaces
          let spaces = "";
          for (let j = 0; j < column - i; j++) {
            spaces += " ";
          }
          // insert spaces in front of the symbol
          cm.replaceRange(spaces, { line: n, ch: i }, { line: n, ch: i });
        } else if (i > column) {
          // symbol is too late -- remove spaces
          cm.replaceRange("", { line: n, ch: column }, { line: n, ch: i });
        }
        // Ensure the right amount of whitespace after the symbol -- exactly one space
        let j = i + 1; // this will be the next position after x[i] that is not whitespace
        while (j < x.length && x[j].trim() === "") {
          j += 1;
        }
        if (j - i >= 2) {
          // remove some spaces
          cm.replaceRange(
            "",
            { line: n, ch: column + 1 },
            { line: n, ch: column + (j - i - 1) }
          );
        } else if (j - i === 1) {
          // insert a space
          cm.replaceRange(
            " ",
            { line: n, ch: column + 1 },
            { line: n, ch: column + 1 }
          );
        }
      }
    }
  }
});
