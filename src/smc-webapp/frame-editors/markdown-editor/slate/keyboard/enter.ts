/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// What happens when you hit the enter key.

import { Element, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { emptyParagraph } from "../padding";
import { register } from "./register";

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
});
