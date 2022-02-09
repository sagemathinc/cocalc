/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// What happens when you hit shift+enter key.

import { Editor, Node, Transforms } from "slate";
import { isElementOfType } from "../elements";
import { register } from "./register";
import { hardbreak } from "../elements/break";
import { isWhitespaceParagraph, isWhitespaceText } from "../padding";

register({ key: "Enter", shift: true }, ({ editor, extra }) => {
  // Configured editor so shift+enter does some action, e.g., "submit chat".
  // In this case, we do that instead of the various things below involving
  // newlines, which can instead be done with control+enter.
  const shiftEnter = extra?.actions?.shiftEnter;
  if (shiftEnter != null) {
    shiftEnter(editor.getMarkdownValue());
    return true;
  }
  return softBreak({ editor });
});

function softBreak({ editor }) {
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

  // Not in a table, so possibly insert a hard break instead of a new
  // paragraph...
  const prev = Editor.previous(editor);
  if (prev == null) return false;
  if (isWhitespaceParagraph(prev[0])) {
    // do nothing.
    return true;
  }
  if (isElementOfType(prev[0], "hardbreak")) {
    // do nothing
    return true;
  }
  if (isWhitespaceText(prev[0])) {
    const prev2 = Editor.previous(editor, { at: prev[1] });
    if (prev2 != null && isElementOfType(prev2[0], "hardbreak")) {
      // do nothing
      return true;
    }
  }
  Transforms.insertNodes(editor, [hardbreak()]);
  Transforms.move(editor, { distance: 1 });
  return true;
}

register({ key: "Enter", ctrl: true }, softBreak);
