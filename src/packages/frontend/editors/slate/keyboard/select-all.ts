/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Transforms } from "slate";
import { register, IS_MACOS } from "./register";
import { rangeAll } from "../slate-util";

// We use this to support windowing.

export function selectAll(editor: Editor) {
  Transforms.setSelection(editor, rangeAll(editor));
}

register({ key: "a", meta: IS_MACOS, ctrl: !IS_MACOS }, ({ editor }) => {
  selectAll(editor);
  return true;
});
