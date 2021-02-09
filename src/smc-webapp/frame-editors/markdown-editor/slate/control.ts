/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "./slate-react";
import { isEqual } from "lodash";

// Scroll to the n-th heading in the document
export function scrollToHeading(editor: ReactEditor, n: number) {
  let i = 0;
  for (const x of Editor.nodes(editor, {
    at: { path: [], offset: 0 },
    match: (node) => node["type"] == "heading",
  })) {
    if (i == n) {
      const elt = ReactEditor.toDOMNode(editor, x[0]);
      elt.scrollIntoView(true);
      return;
    }
    i += 1;
  }
  // didn't find it.
}

export function moveCursorDown(
  editor: ReactEditor,
  force: boolean = false
): void {
  const focus = editor.selection?.focus;
  if (focus == null) return;
  Transforms.move(editor, { distance: 1, unit: "line" });
  if (!force) return;
  const newFocus = editor.selection?.focus;
  if (newFocus == null) return;
  if (isEqual(focus, newFocus)) {
    // didn't move down; at end of doc, so put a blank paragraph there
    // and move to that.
    editor.apply({
      type: "insert_node",
      path: [editor.children.length],
      node: { type: "paragraph", children: [{ text: "" }] },
    });
    Transforms.move(editor, { distance: 1, unit: "line" });
    return;
  }
  ensureCursorNotVoid(editor);
}

export function moveCursorUp(
  editor: ReactEditor,
  force: boolean = false
): void {
  const focus = editor.selection?.focus;
  if (focus == null) return;
  Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
  if (!force) return;
  const newFocus = editor.selection?.focus;
  if (newFocus == null) return;
  if (isEqual(focus, newFocus)) {
    // didn't move -- put a blank paragraph there
    // and move to that.
    editor.apply({
      type: "insert_node",
      path: [0],
      node: { type: "paragraph", children: [{ text: "" }] },
    });
    Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
  }
  ensureCursorNotVoid(editor, true);
}

export function ensureCursorNotVoid(editor: ReactEditor, up: boolean = false) {
  if (!Editor.isVoid(editor, editor.getFragment()[0])) return;
  // cursor in a void element, so insert a blank paragraph at
  // cursor and put cursor back.
  const { selection } = editor;
  if (selection == null) return;
  editor.apply({
    type: "insert_node",
    path: [selection.focus.path[0] + (up ? +1 : 0)],
    node: { type: "paragraph", children: [{ text: "" }] },
  });
  if (up) {
    Transforms.move(editor, { distance: 1, unit: "line" });
  } else {
    if (selection != null) {
      // typescript wants this check
      Transforms.setSelection(editor, selection);
    }
  }
}

export function moveCursorToBeginningOfBlock(editor: Editor): void {
  const selection = editor.selection;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  const path = [...selection.focus.path];
  if (path.length == 0) return;
  path[path.length - 1] = 0;
  const focus = { path, offset: 0 };
  Transforms.setSelection(editor, { focus, anchor: focus });
}
