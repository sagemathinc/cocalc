/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Range, Transforms, Point } from "slate";
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

export function moveCursorDown(editor: Editor, force: boolean = false): void {
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
  ensureCursorNotBlocked(editor);
}

export function moveCursorUp(editor: Editor, force: boolean = false): void {
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
  ensureCursorNotBlocked(editor, true);
}

export function blocksCursor(editor, up: boolean = false): boolean {
  if (editor.selection == null || !Range.isCollapsed(editor.selection)) {
    return false;
  }

  let elt;
  try {
    elt = editor.getFragment()[0];
  } catch (_) {
    return false;
  }
  if (Editor.isVoid(editor, elt)) {
    return true;
  }

  // Several non-void elements also block the cursor,
  // in the sense that you can't move the cursor immediately
  // before/after them.
  // TODO: instead of listing here, should be part of registration
  // system in ../elements.
  if (
    editor.selection != null &&
    ((up && isAtBeginningOfBlock(editor)) || (!up && isAtEndOfBlock(editor))) &&
    (elt.type == "blockquote" ||
      elt.type == "ordered_list" ||
      elt.type == "bullet_list")
  ) {
    return true;
  }

  return false;
}

export function ensureCursorNotBlocked(editor: Editor, up: boolean = false) {
  if (!blocksCursor(editor, !up)) return;
  // cursor in a void element, so insert a blank paragraph at
  // cursor and put cursor in that blank paragraph.
  const { selection } = editor;
  if (selection == null) return;
  const path = [selection.focus.path[0] + (up ? +1 : 0)];
  editor.apply({
    type: "insert_node",
    path,
    node: { type: "paragraph", children: [{ text: "" }] },
  });
  Transforms.setSelection(editor, {
    focus: { path, offset: 0 },
    anchor: { path, offset: 0 },
  });
  /*
  if (up) {
    Transforms.move(editor, { distance: 1, unit: "line" });
  } else {
    if (selection != null) {
      // typescript wants this check
      Transforms.setSelection(editor, selection);
    }
  }
  */
}

export function moveCursorToBeginningOfBlock(
  editor: Editor,
  path?: number[]
): void {
  if (path == null) {
    const selection = editor.selection;
    if (selection == null || !Range.isCollapsed(selection)) {
      return;
    }
    path = selection.focus.path;
  }
  if (path.length > 1) {
    path = [...path]; // make mutable copy
    path[path.length - 1] = 0;
  }
  const focus = { path, offset: 0 };
  Transforms.setSelection(editor, { focus, anchor: focus });
}

function isAtBeginningOfBlock(editor: Editor, at?: Point): boolean {
  if (at == null) {
    at = editor.selection?.focus;
    if (at == null) return false;
  }
  if (at.offset != 0) return false;
  for (const i of at.path.slice(1)) {
    if (i != 0) return false;
  }
  return true;
}

export function isAtEndOfBlock(editor: Editor, at?: Point): boolean {
  if (at == null) {
    at = editor.selection?.focus;
    if (at == null) return false;
  }
  const after = Editor.after(editor, at);
  if (after == null) {
    // at end of the entire document, so definitely at the end of the block
    return true;
  }
  if (isEqual(after.path, at.path)) {
    // next point is in the same node, so can't be at the end (not
    // even the end of this node).
    return false;
  }
  const n = Math.min(after.path.length, at.path.length);
  if (isEqual(at.path.slice(0, n - 1), after.path.slice(0, n - 1))) {
    return false;
  }
  return true;
}

export function moveCursorToEndOfBlock(editor: Editor, path?: number[]): void {
  // This is sort of silly -- we move cursor to the beginning, then move
  // cursor 1 line, which moves it to the end... unless line is empty, in
  // which case we move it back.  Obviously this could be done more directly,
  // but it is a bit complicated and nice to reuse what's in slate; also maybe
  // slate has this already and when I find it just swap it in.
  moveCursorToBeginningOfBlock(editor, path);
  const { selection } = editor;
  if (selection == null) return;
  Transforms.move(editor, { distance: 1, unit: "line" });
  const newSelection = editor.selection;
  if (newSelection == null) return;
  let a = selection.focus.path;
  let b = newSelection.focus.path;
  if (a.length != b.length) return;
  if (a.length > 1) {
    a = a.slice(0, a.length - 1);
    b = b.slice(0, b.length - 1);
  }
  if (a[a.length - 1] < b[b.length - 1]) {
    Transforms.setSelection(editor, selection);
  }
}
