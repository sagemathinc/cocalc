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
import { IS_FIREFOX } from "smc-webapp/feature";

const down = ({ editor, shift }) => {
  if (ReactEditor.selectionIsInDOM(editor)) {
    // just work in the usual way
    if (!blocksCursor(editor, false)) {
      if (IS_FIREFOX && ReactEditor.isUsingWindowing(editor)) {
        // We sometimes programatically move the cursor since on some platforms
        // (e.g., firefox with react-window that uses position absolute)
        // cursor movement is broken.
        ReactEditor.moveDOMCursorLineFirefox(editor, true, shift);
        return true;
      } else {
        // built in cursor movement works fine
        return false;
      }
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
    editor.scrollCaretIntoView();
    return true;
  }
};

register({ key: "ArrowDown" }, down);

const up = ({ editor, shift }) => {
  if (ReactEditor.selectionIsInDOM(editor)) {
    if (!blocksCursor(editor, true)) {
      if (IS_FIREFOX && ReactEditor.isUsingWindowing(editor)) {
        ReactEditor.moveDOMCursorLineFirefox(editor, false, shift);
        return true;
      } else {
        // built in cursor movement works fine
        return false;
      }
    }
    moveCursorUp(editor, true);
    return true;
  } else {
    editor.scrollCaretIntoView();
    return true;
  }
};

register({ key: "ArrowUp" }, up);

if (IS_FIREFOX) {
  register({ key: "ArrowUp", shift: true }, ({ editor }) =>
    up({ editor, shift: true })
  );
  register({ key: "ArrowDown", shift: true }, ({ editor }) =>
    down({ editor, shift: true })
  );
}
