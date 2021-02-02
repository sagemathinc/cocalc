/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Formatting (etc.) triggered via the keyboard in various ways.

*/

import { Element, Node, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { formatText } from "./format-text";

export function keyFormat(editor, e): boolean {
  if (formatText(editor, e)) {
    // control+b, etc. to format selected text.
    return true;
  }
  // console.log("onKeyDown", { keyCode: e.keyCode, key: e.key });
  if (e.key == " ") {
    const autoformat = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);
    // @ts-ignore - that second argument below is "unsanctioned"
    editor.insertText(" ", autoformat);
    return true;
  }
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
    if (e.key == "Tab") {
      // Markdown doesn't have a notion of tabs in text...
      // Putting in four spaces for now, but we'll probably change this...
      editor.insertText("    ");
      return true;
    }
    if (e.key == "Enter") {
      const fragment = editor.getFragment();
      const x = fragment?.[0];
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
    }
  }
  if (e.shiftKey && e.key == "Enter") {
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
  return false;
}
