/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "./register";
import { isElementOfType } from "../elements";
import { Editor } from "slate";

function toggleCollapsedSections(editor): void {
  let changed: boolean = false;
  for (const [element] of Editor.nodes(editor, {
    match: (element) => isElementOfType(element, "heading"),
  })) {
    editor.collapsedSections.set(
      element,
      !editor.collapsedSections.get(element)
    );
    changed = true;
  }
  if (changed) {
    editor.updateHiddenChildren();
  }
}

register({ key: "q", ctrl: true }, ({ editor }) => {
  toggleCollapsedSections(editor);
  return true;
});
