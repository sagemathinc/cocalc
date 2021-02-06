/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Range, Transforms } from "slate";

export function selectAll(editor: Editor): void {
  const first = Editor.first(editor, []);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0;
  Transforms.setSelection(editor, {
    anchor: { path: first[1], offset: 0 },
    focus: { path: last[1], offset },
  });
}

export function backspaceVoid(editor: Editor): boolean {
  console.log("backspaceVoid", 0);
  if (editor.selection == null || !Range.isCollapsed(editor.selection)) {
    return false;
  }
  const { value } = Editor.nodes(editor, {
    match: (node) => Editor.isVoid(editor, node),
  }).next();
  if (value == null) return false;
  Transforms.delete(editor, { at: value[1] });
  return true;
}
