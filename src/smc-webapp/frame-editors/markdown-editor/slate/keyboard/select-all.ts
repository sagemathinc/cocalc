/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Transforms } from "slate";
import { register, IS_MACOS } from "./register";

// On Firefox with windowing enabled,
// doing browser select all selects too much (e.g., the
// react-windowed list), and this causes crashes.  Note that this
// selectAll here only partly addresses the problem with windowing
// and large documents where select all fails (due to missing DOM
// nodes not in the window).  The select now happens but other
// things break.

register({ key: "a", meta: IS_MACOS, ctrl: !IS_MACOS }, ({ editor }) => {
  const first = Editor.first(editor, []);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0;
  Transforms.setSelection(editor, {
    anchor: { path: first[1], offset: 0 },
    focus: { path: last[1], offset },
  });
  return true;
});
