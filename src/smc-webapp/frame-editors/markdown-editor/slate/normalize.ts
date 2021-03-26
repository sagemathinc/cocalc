/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Range, Text, Transforms } from "slate";
import { isEqual } from "lodash";

export const withNormalize = (editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    if (Element.isElement(node) && node.type === "list_item") {
      // If the element is a list_item, ensure it is contained in a list.
      const [parent] = Editor.parent(editor, path);
      if (
        !Element.isElement(parent) ||
        (parent.type != "bullet_list" && parent.type != "ordered_list")
      ) {
        // invalid document: every list_item should be in a list.
        Transforms.wrapNodes(editor, { type: "bullet_list" } as Element, {
          at: path,
        });
      }
    }

    if (Element.isElement(node) && Text.isText(node.children[0])) {
      // Trim *all* whitespace from the beginning of blocks whose first child is Text, since
      // markdown doesn't allow for it.  (You can use &nbsp; of course.)
      const firstText = node.children[0].text;
      if (firstText != null) {
        // We actually get rid of spaces and tabs, but not ALL whitespace.  For example,
        // if you type "&nbsp; bar", then autoformat turns that into *two* whitespace
        // characters, with the &nbsp; being ascii 160, which counts if we just searched
        // via .search(/\S|$/), but not if we explicitly only look for space or tab as below.
        const i = firstText.search(/[^ \t]|$/);
        if (i > 0) {
          const p = path.concat([0]);
          const { selection } = editor;
          const text = firstText.slice(0, i);
          editor.apply({ type: "remove_text", offset: 0, path: p, text });
          if (
            selection != null &&
            Range.isCollapsed(selection) &&
            isEqual(selection.focus.path, p)
          ) {
            const offset = Math.max(0, selection.focus.offset - i);
            const focus = { path: p, offset };
            setTimeout(() =>
              Transforms.setSelection(editor, { focus, anchor: focus })
            );
          }
        }
      }
    }

    // Fall back to the original `normalizeNode` to enforce other constraints.
    normalizeNode(entry);
  };

  return editor;
};
