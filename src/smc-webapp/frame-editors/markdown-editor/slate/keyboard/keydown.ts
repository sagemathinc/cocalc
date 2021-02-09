/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Formatting (etc.) triggered via the keyboard in various ways.

*/

import { Editor } from "slate";
import { moveCursorUp, moveCursorDown } from "../control";
import { getHandler } from "./register";

export function keyDownHandler(editor, e): boolean {
  const handler = getHandler(e);
  if (handler != null) {
    return handler(editor);
  }

  // console.log("onKeyDown", { keyCode: e.keyCode, key: e.key });
  const unmodified = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

  if (unmodified) {
    if (e.key == "ArrowDown") {
      if (!Editor.isVoid(editor, editor.getFragment()[0])) {
        return false;
      }
      moveCursorDown(editor, true);
      return true;
    }

    if (e.key == "ArrowUp") {
      if (!Editor.isVoid(editor, editor.getFragment()[0])) {
        return false;
      }
      moveCursorUp(editor, true);
      return true;
    }
  }
  return false;
}
