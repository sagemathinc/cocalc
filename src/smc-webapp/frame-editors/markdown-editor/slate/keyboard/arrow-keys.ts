/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit arrow keys.
*/

import { register } from "./register";
import { blocksCursor, moveCursorUp, moveCursorDown } from "../control";

register({ key: "ArrowDown" }, ({ editor }) => {
  if (!blocksCursor(editor, false)) return false;
  moveCursorDown(editor, true);
  return true;
});

register({ key: "ArrowUp" }, ({ editor }) => {
  if (!blocksCursor(editor, true)) return false;
  moveCursorUp(editor, true);
  return true;
});
