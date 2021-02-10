/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// What happens when you hit shift+enter key.

import { Node, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { register } from "./register";

register({ key: "Enter", shift: true }, ({ editor }) => {
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
});
