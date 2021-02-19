/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Range, Transforms, Point } from "slate";
import { ReactEditor } from "./slate-react";
import { isEqual } from "lodash";
import { rangeAll } from "./keyboard/select-all";
import { emptyParagraph } from "./padding";

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
      node: emptyParagraph(),
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
      node: emptyParagraph(),
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
    ((up && isAtBeginningOfBlock(editor, { mode: "highest" })) ||
      (!up && isAtEndOfBlock(editor, { mode: "highest" }))) &&
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
  const focus = { path: path.concat([0]), offset: 0 };
  Transforms.setSelection(editor, {
    focus,
    anchor: focus,
  });
}

// Find path to a given element.
export function findElement(
  editor: Editor,
  element: Element
): number[] | undefined {
  // Usually when called, the element we are searching for is right
  // near the selection, so this first search finds it.
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
  })) {
    return path;
  }
  // Searching at the selection failed, so we try searching the
  // entire document instead.
  // This has to work unless element isn't in the document (which
  // is of course possible).
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
    at: rangeAll(editor),
  })) {
    return path;
  }
}

export function moveCursorToElement(editor: Editor, element: Element): void {
  const path = findElement(editor, element);
  if (path == null) return;
  const point = { path, offset: 0 };
  Transforms.setSelection(editor, { anchor: point, focus: point });
}

// Move cursor to the end of a top-level non-inline element.
export function moveCursorToEndOfElement(
  editor: Editor,
  element: Element // non-line element
): void {
  // Find the element
  const path = findElement(editor, element);
  if (path == null) return;
  // Create location at start of the element
  const at = { path, offset: 0 };
  // Move to block "after" where the element is.  This is
  // sort of random in that it might be at the end of the
  // element, or it might be in the next block.  E.g.,
  // for "# fo|o**bar**" it is in the next block, but for
  // "# foo**b|ar**" it is at the end of the current block!?
  // We work around this bug by moving back 1 character
  // in case we moved to the next top-level block.
  let end = Editor.after(editor, at, { unit: "block" });
  if (end == null) return;
  if (end.path[0] != path[0]) {
    end = Editor.before(editor, end);
  }
  Transforms.setSelection(editor, { anchor: end, focus: end });
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

// True if point is at the beginning of the containing block
// that it is in (or top level block if mode='highest').
export function isAtBeginningOfBlock(
  editor: Editor,
  options: { at?: Point; mode?: "lowest" | "highest" }
): boolean {
  let { at, mode } = options;
  if (mode == null) mode = "lowest";
  if (at == null) {
    at = editor.selection?.focus;
    if (at == null) return false;
  }
  if (at.offset != 0) return false;
  if (mode == "lowest") {
    // easy special case.
    return at.path[at.path.length - 1] == 0;
  }
  const before = Editor.before(editor, at);
  if (before == null) {
    // at beginning of the entire document, so definitely at the beginning of the block
    return true;
  }
  return before.path[0] < at.path[0];
}

// True if point is at the end of the containing block
// that it is in (or top level block if mode='highest')
export function isAtEndOfBlock(
  editor: Editor,
  options: { at?: Point; mode?: "lowest" | "highest" }
): boolean {
  let { at, mode } = options;
  if (mode == null) mode = "lowest";
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
  if (mode == "highest") {
    // next path needs to start with a new number.
    return after.path[0] > at.path[0];
  } else {
    const n = Math.min(after.path.length, at.path.length);
    if (isEqual(at.path.slice(0, n - 1), after.path.slice(0, n - 1))) {
      return false;
    }
    return true;
  }
}
