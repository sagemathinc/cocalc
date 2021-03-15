/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit arrow keys.
*/

import { register } from "./register";
import { blocksCursor, moveCursorUp, moveCursorDown } from "../control";
import { ReactEditor } from "../slate-react";

register({ key: "ArrowDown" }, ({ editor }) => {
  if (ReactEditor.selectionIsInDOM(editor)) {
    // just work in the usual way
    if (!blocksCursor(editor, false)) return false;
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
    editor.scrollCaretIntoView();
    return true;
  }
});

register({ key: "ArrowUp" }, ({ editor }) => {
  if (ReactEditor.selectionIsInDOM(editor)) {
    if (!blocksCursor(editor, true)) return false;
    moveCursorUp(editor, true);
    return true;
  } else {
    editor.scrollCaretIntoView();
    return true;
  }
});
