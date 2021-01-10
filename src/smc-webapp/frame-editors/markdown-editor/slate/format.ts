/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_array } from "smc-util/misc";
import { Editor, Text, Transforms } from "slate";

export function format_selected_text(editor: Editor, mark: "string"): void {
  if (!editor.selection) return; // nothing to do.
  Transforms.setNodes(
    editor,
    { [mark]: !is_already_marked(editor, mark) },
    { match: (node) => Text.isText(node), split: true }
  );
}

// returns true if current selection *starts* with mark.
function is_already_marked(editor: Editor, mark: "string"): boolean {
  if (!editor.selection) return false;
  return is_fragment_already_marked(
    Editor.fragment(editor, editor.selection),
    mark
  );
}

// returns true if fragment *starts* with mark.
function is_fragment_already_marked(fragment, mark: "string"): boolean {
  if (is_array(fragment)) {
    fragment = fragment[0];
    if (fragment == null) return false;
  }
  if (Text.isText(fragment) && fragment[mark]) return true;
  if (fragment.children) {
    return is_fragment_already_marked(fragment.children, mark);
  }
  return false;
}
