/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Range, Editor, Element, Point, Transforms } from "slate";
import { endswith } from "smc-util/misc";

export const withDeleteBackward = (editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    if (!customDeleteBackwards(editor)) {
      // no custom handling, so just do the default:
      deleteBackward(...args);
    }
  };

  return editor;
};

function customDeleteBackwards(editor: Editor): boolean | undefined {
  // Figure out first if we should so something special:
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) return;

  const above = Editor.above(editor, {
    match: (node) => Editor.isBlock(editor, node) && node.type != "paragraph",
  });
  if (above == null) return;
  const [block, path] = above;
  if (Editor.isEditor(block) || !Element.isElement(block)) {
    return;
  }
  const start = Editor.start(editor, path);
  if (!Point.equals(selection.anchor, start)) return;

  // This is where we actually might do something special, finally.
  // Cursor is at the beginning of a non-paragraph block-level
  // element, so maybe do something special.
  switch (block.type) {
    case "list_item":
      deleteBackwardsInListItem(editor);
      return true;
  }
}

// Special handling inside a list item.  This is complicated since
// the children of the list_item might include a paragraph, or could
// just directly be leaves.
function deleteBackwardsInListItem(editor: Editor) {
  const immediate = Editor.above(editor, {
    match: (node) => Editor.isBlock(editor, node),
  });
  if (immediate == null || !Element.isElement(immediate[0])) return;
  if (immediate[0].type == "list_item") {
    // Turn the list_item into a paragraph, which can live by itself:
    Transforms.setNodes(editor, {
      type: "paragraph",
    });
  } else {
    // Make sure that tight isn't set on our paragraph that we're going
    // to hoist out of this list, since tight is only useful inside
    // a list.
    Transforms.setNodes(editor, {
      tight: undefined,
    });
    // It's a list_item that contains some other block element, so
    // just unwrap which gets rid of the list_item, leaving a
    // non-list-item block element, which can live on its own:
    Transforms.unwrapNodes(editor, {
      match: (node) => Element.isElement(node) && node.type == "list_item",
      mode: "lowest",
    });
  }
  // Then move up our newly free item by unwrapping it relative to
  // the containing list.  This may split the list into two lists.
  Transforms.unwrapNodes(editor, {
    match: (node) => Element.isElement(node) && endswith(node.type, "_list"),
    split: true,
    mode: "lowest",
  });
}
