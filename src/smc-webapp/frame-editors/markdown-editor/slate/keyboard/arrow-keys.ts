/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit arrow keys.
*/

import { Editor } from "slate";
import { register } from "./register";
import { moveCursorUp, moveCursorDown } from "../control";

register({ key: "ArrowDown" }, ({editor}) => {
  if (!Editor.isVoid(editor, editor.getFragment()[0])) {
    return false;
  }
  moveCursorDown(editor, true);
  return true;
});

register({ key: "ArrowUp" }, ({editor}) => {
  if (!Editor.isVoid(editor, editor.getFragment()[0])) {
    return false;
  }
  moveCursorUp(editor, true);
  return true;
});
