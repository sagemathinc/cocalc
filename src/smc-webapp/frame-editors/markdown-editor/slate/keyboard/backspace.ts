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

import { Path, Point, Range, Text, Transforms } from "slate";
import { register } from "./register";
import { getNodeAt } from "../slate-util";

function backspaceKey({ editor }) {
  const { selection } = editor;
  if (selection == null) return false;
  if (!Range.isCollapsed(selection)) {
    const edges = Range.edges(selection);
    const node = getNodeAt(editor, edges[1].path);
    if (Text.isText(node)) {
      // Workaround this bug:
      //    https://github.com/ianstormtaylor/slate/issues/4121
      // which is in the core of slate.
      if (node.text.length == edges[1].offset) {
        // Selection ends at the edge of a text node,
        // so we move the cursor to the beginning of
        // the *next* node, but make the offset 0,
        // so that when we delete nothing is removed
        // from there.
        const path = Path.next(edges[1].path);
        const nextNode = getNodeAt(editor, path);
        if (Text.isText(nextNode)) {
          // NOTE: it doesn't matter if we reverse the range here, since we're
          // about to delete this selection.
          const newSelection = {
            anchor: edges[0],
            focus: { path, offset: 0 },
          };
          Transforms.setSelection(editor, newSelection);
        }
      }
    }

    return false;
  }

  // In slatejs you can't delete various block elements at the beginning of the
  // document. This is yet another **BUG IN SLATE**, which we workaround by
  // inserting an empty node at the beginning of the document.  This does not
  // seem to be reported upstream, and I'm not even bothering since there's
  // so many bugs like this we have to workaround.   Morever, if this bug is
  // fixed upstream, it breaks our workaround!  Sigh.
  if (isAtStart(editor.selection.focus)) {
    editor.apply({
      type: "insert_node",
      path: [0],
      node: { type: "paragraph", children: [{ text: "" }] },
    });
    Transforms.delete(editor, {
      reverse: true,
    });
  }

  // This seems to work perfectly in all cases, including working around the
  // void delete bug in Slate:
  //     https://github.com/ianstormtaylor/slate/issues/3875
  editor.deleteBackward();
  return true;
}

register([{ key: "Backspace" }, { key: "Delete" }], backspaceKey);

function isAtStart(loc: Point): boolean {
  for (const n of loc.path) {
    if (n != 0) return false;
  }
  return loc.offset == 0;
}
