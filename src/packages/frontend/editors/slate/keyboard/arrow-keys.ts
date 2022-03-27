/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit arrow keys.
*/

import { register } from "./register";
import { blocksCursor, moveCursorUp, moveCursorDown } from "../control";
import { SlateEditor } from "../types";
import { ReactEditor } from "../slate-react";

const down = ({ editor }: { editor: SlateEditor }) => {
  const cur = editor.selection?.focus;

  try {
    if (ReactEditor.selectionIsInDOM(editor)) {
      // just work in the usual way
      if (!blocksCursor(editor, false)) {
        // built in cursor movement works fine
        return false;
      }
      moveCursorDown(editor, true);
      return true;
    } else {
      // in case of windowing when actual selection is not even
      // in the DOM, it's much better to just scroll it into view
      // and not move the cursor at all than to have it be all
      // wrong (which is what happens with contenteditable and
      // selection change).  I absolutely don't know how to
      // subsequently move the cursor down programatically in
      // contenteditable, and it makes no sense to do so in slate
      // since the semantics of moving down depend on the exact rendering.
      return true;
    }
  } finally {
    if (cur != null && editor.onCursorBottom != null) {
      // check if attempt to move cursor did nothing in the next
      // render loop (after selection gets sync'd).
      setTimeout(() => {
        if (cur == editor.selection?.focus) {
          editor.onCursorBottom?.();
        }
      }, 0);
    }
  }
};

register({ key: "ArrowDown" }, down);

const up = ({ editor }: { editor: SlateEditor }) => {
  const cur = editor.selection?.focus;
  try {
    if (ReactEditor.selectionIsInDOM(editor)) {
      if (!blocksCursor(editor, true)) {
        // built in cursor movement works fine
        return false;
      }
      moveCursorUp(editor, true);
      return true;
    } else {
      return true;
    }
  } finally {
    if (cur != null && editor.onCursorBottom != null) {
      // check if attempt to move cursor did nothing in the next
      // render loop (after selection gets sync'd).
      setTimeout(() => {
        if (cur == editor.selection?.focus) {
          editor.onCursorTop?.();
        }
      }, 0);
    }
  }
};

register({ key: "ArrowUp" }, up);
