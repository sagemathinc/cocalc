/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Range, Transforms } from "slate";
import { register, IS_MACOS } from "./register";

// On Firefox with windowing enabled,
// doing browser select all selects too much (e.g., the
// react-windowed list), and this causes crashes.  Note that this
// selectAll here only partly addresses the problem with windowing
// and large documents where select all fails (due to missing DOM
// nodes not in the window).  The select now happens but other
// things break.

export function rangeAll(editor: Editor): Range {
  const first = Editor.first(editor, []);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0; // TODO: not 100% that this is right
  return {
    anchor: { path: first[1], offset: 0 },
    focus: { path: last[1], offset },
  };
}

export function selectAll(editor: Editor) {
  Transforms.setSelection(editor, rangeAll(editor));
}

register({ key: "a", meta: IS_MACOS, ctrl: !IS_MACOS }, ({ editor }) => {
  selectAll(editor);
  return true;
});
