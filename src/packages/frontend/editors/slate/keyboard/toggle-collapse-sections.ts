/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "./register";
import { isElementOfType } from "../elements";
import { Editor } from "slate";
import { ReactEditor } from "../slate-react";

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
    // Cause the editor to update so that the useSlate context hook updates.
    // (Only needed because editor.collapsedSection is a normal Set.)
    ReactEditor.forceUpdate(editor);
  }
}

register({ key: "q", ctrl: true }, ({ editor }) => {
  toggleCollapsedSections(editor);
  return true;
});
