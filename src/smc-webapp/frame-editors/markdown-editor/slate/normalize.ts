/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Ideas for things to put here that aren't here now:


- merging adjacent lists, since the roundtrip to markdown does that.

*/

import { Editor, Element, Path, Range, Text, Transforms } from "slate";
import { isEqual } from "lodash";

import { getNodeAt } from "./slate-util";
import { emptyParagraph } from "./padding";

export const withNormalize = (editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    ensureListItemInAList({ editor, node, path });
    trimLeadingWhitespace({ editor, node, path });
    mergeAdjacentLists({ editor, node, path });
    ensureDocumentNonempty({ editor });

    // Fall back to the original `normalizeNode` to enforce other constraints.
    normalizeNode(entry);
  };

  return editor;
};

// This does get called if you somehow blank the document. It
// gets called with path=[], which makes perfect sense.  If we
// don't put something in, then things immediately break due to
// selection assumptions.  Slate doesn't do this automatically,
// since it doesn't nail down the internal format of a blank document.
function ensureDocumentNonempty({ editor }) {
  if (editor.children.length == 0) {
    Editor.insertNode(editor, emptyParagraph());
  }
}

// Ensure every list_item is contained in a list.
function ensureListItemInAList({ editor, node, path }) {
  if (Element.isElement(node) && node.type === "list_item") {
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
}

/*
Trim *all* whitespace from the beginning of blocks whose first child is Text,
since markdown doesn't allow for it. (You can use &nbsp; of course.)
*/
function trimLeadingWhitespace({ editor, node, path }) {
  if (Element.isElement(node) && Text.isText(node.children[0])) {
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
}

/*
If there are two adjacent lists of the same type, merge the second one into
the first.
*/
function mergeAdjacentLists({ editor, node, path }) {
  if (
    Element.isElement(node) &&
    (node.type === "bullet_list" || node.type === "ordered_list")
  ) {
    const nextPath = Path.next(path);
    const nextNode = getNodeAt(editor, nextPath);
    if (Element.isElement(nextNode) && nextNode.type == node.type) {
      // We have two adjacent lists of the same type: combine them.
      // Note that we do NOT take into account tightness when deciding
      // whether to merge, since in markdown you can't have a non-tight
      // and tight list of the same type adjacent to each other anyways.
      Transforms.mergeNodes(editor, { at: nextPath });
    }
  }
}
