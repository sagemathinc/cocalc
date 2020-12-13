/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Position } from "codemirror";

// We define the diffApply extension separately so it can be applied to CodeMirror's
// in iframes, e.g., Jupyter's.

export function cm_define_diffApply_extension(cm) {
  // applies a diff and returns last pos modified
  cm.defineExtension("diffApply", function (diff) {
    // @ts-ignore
    const editor = this;
    const next_pos = function (val: string, pos: Position): Position {
      // This functions answers the question:
      // If you were to insert the string val at the CodeMirror position pos
      // in a codemirror document, at what position (in codemirror) would
      // the inserted string end at?
      const number_of_newlines = (val.match(/\n/g) || []).length;
      if (number_of_newlines === 0) {
        return { line: pos.line, ch: pos.ch + val.length };
      } else {
        return {
          line: pos.line + number_of_newlines,
          ch: val.length - val.lastIndexOf("\n") - 1,
        };
      }
    };

    let pos: Position = { line: 0, ch: 0 }; // start at the beginning
    let last_pos: Position | undefined = undefined;
    for (let chunk of diff) {
      const op = chunk[0]; // 0 = stay same; -1 = delete; +1 = add
      const val = chunk[1]; // the actual text to leave same, delete, or add
      const pos1 = next_pos(val, pos);

      switch (op) {
        case 0: // stay the same
          // Move our pos pointer to the next position
          pos = pos1;
          break;
        //console.log("skipping to ", pos1)
        case -1: // delete
          // Delete until where val ends; don't change pos pointer.
          editor.replaceRange("", pos, pos1);
          last_pos = pos;
          break;
        //console.log("deleting from ", pos, " to ", pos1)
        case +1: // insert
          // Insert the new text right here.
          editor.replaceRange(val, pos);
          //console.log("inserted new text at ", pos)
          // Move our pointer to just beyond the text we just inserted.
          pos = pos1;
          last_pos = pos1;
          break;
      }
    }
    return last_pos;
  });
}
