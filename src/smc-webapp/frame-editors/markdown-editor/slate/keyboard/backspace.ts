/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the backspace/delete key.

  - deleting (certain?) void elements. See
     https://github.com/ianstormtaylor/slate/issues/3875
    for discussion of why we must implement this ourselves.
*/

import { Editor, Range, Transforms } from "slate";
import { register } from "./register";

export function backspaceKey(editor: Editor): boolean {
  if (editor.selection == null || !Range.isCollapsed(editor.selection)) {
    // default handler
    return false;
  }
  // Check if there's a void node at cursor (e.g., checkbox) and if so delete it.
  const { value } = Editor.nodes(editor, {
    match: (node) => Editor.isVoid(editor, node),
  }).next();
  if (value == null) {
    // No void -- fall back to default behavior.
    return false;
  }
  Transforms.delete(editor, { at: value[1] });
  return true;
}

register({ key: "Backspace" }, backspaceKey);
register({ key: "Delete" }, backspaceKey);
