/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// What happens when you hit the enter key.

import { Editor, Element, Node, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { emptyParagraph } from "../padding";

export function enterKey(editor: Editor, e, unmodified: boolean): boolean {
  if (unmodified) {
    return unmodifiedEnter(editor);
  }
  if (e.shiftKey) {
    return shiftEnter(editor);
  }
  return false;
}

function shiftEnter(editor): boolean {
  // In a table, the only option is to insert a <br/>.
  const fragment = editor.getFragment();
  if (isElementOfType(fragment?.[0], "table")) {
    const br = {
      isInline: true,
      isVoid: true,
      type: "html_inline",
      html: "<br />",
      children: [{ text: " " }],
    } as Node;
    Transforms.insertNodes(editor, [br]);
    // Also, move cursor forward so it is *after* the br.
    Transforms.move(editor, { distance: 1 });
    return true;
  }

  // Not in a table, so insert a hard break instead of a new
  // paragraph like enter creates.
  Transforms.insertNodes(editor, [
    {
      type: "hardbreak",
      isInline: true,
      isVoid: false,
      children: [{ text: "\n" }],
    } as Node,
  ]);
  return true;
}

function unmodifiedEnter(editor: Editor): boolean {
  const fragment = editor.getFragment();
  const x = fragment?.[0];
  if (isElementOfType(x, "heading")) {
    // If you hit enter in a heading,
    Transforms.insertNodes(editor, [emptyParagraph()], {
      match: (node) => isElementOfType(node, "heading"),
    });
    return true;
  }
  if (isElementOfType(x, ["bullet_list", "ordered_list"])) {
    Transforms.insertNodes(
      editor,
      [{ type: "list_item", children: [{ text: "" }] } as Element],
      {
        match: (node) => isElementOfType(node, "list_item"),
      }
    );
    return true;
  }
  return false;
}
