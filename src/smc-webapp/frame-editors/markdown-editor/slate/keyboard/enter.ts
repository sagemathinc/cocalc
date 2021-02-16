/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// What happens when you hit the enter key.

import { Element, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { emptyParagraph } from "../padding";
import { register } from "./register";
import { isAtEndOfBlock, moveCursorToBeginningOfBlock } from "../control";
import { hardbreak } from "../elements/linebreak";

register({ key: "Enter" }, ({ editor }) => {
  const fragment = editor.getFragment();
  const x = fragment?.[0];

  if (isElementOfType(x, "heading")) {
    // If you hit enter in a heading,
    Transforms.insertNodes(editor, [emptyParagraph()], {
      match: (node) => isElementOfType(node, "heading"),
    });
    return true;
  }

  if (isElementOfType(x, "paragraph")) {
    // If you hit enter in a paragraph, the default behavior is creating
    // another empty paragraph, which just gets ignored by markdown.
    // So don't do it, as it's confusing.  Instead we just insert
    // a hard break (same as shift-enter).
    Transforms.insertNodes(editor, [hardbreak()]);
    return true;
  }

  if (isElementOfType(x, ["bullet_list", "ordered_list"])) {
    const atEnd = isAtEndOfBlock(editor);
    Transforms.insertNodes(
      editor,
      [{ type: "list_item", children: [{ text: "" }] } as Element],
      {
        match: (node) => isElementOfType(node, "list_item"),
        mode: "lowest",
      }
    );
    if (!atEnd) {
      // In this case slate splits the list item so we end up
      // with an extra blank one.
      // First move cursor down one line
      Transforms.removeNodes(editor, {
        match: (node) => isElementOfType(node, "list_item"),
      });
      Transforms.move(editor, { distance: 1, unit: "line" });
      moveCursorToBeginningOfBlock(editor);
    }
    return true;
  }
  return false;
});
