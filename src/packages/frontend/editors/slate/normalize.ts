/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Ideas for things to put here that aren't here now:

- merging adjacent lists, since the roundtrip to markdown does that.

WARNING: The following warning used to apply.  However, we now normalize
markdown_to_slate always, so it does not apply: "Before very very very
careful before changing anything here!!!
It is absolutely critical that the output of markdown_to_slate be normalized
according to all the rules here.  If you change a rule here, that will
likely break this assumption and things will go to hell.  Be careful.""

*/

import { Editor, Element, Path, Range, Text, Transforms } from "slate";
import { isEqual } from "lodash";

import { getNodeAt } from "./slate-util";
import { emptyParagraph } from "./padding";
import { isListElement } from "./elements/list";

interface NormalizeInputs {
  editor?: Editor;
  node?: Node;
  path?: Path;
}

type NormalizeFunction = (NormalizeInputs) => void;

const NORMALIZERS: NormalizeFunction[] = [];

export const withNormalize = (editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    for (const f of NORMALIZERS) {
      //const before = JSON.stringify(editor.children);
      const before = editor.children;
      f({ editor, node, path });
      if (before !== editor.children) {
        // changed so return; normalize will get called again by
        // slate until no changes.
        return;
      }
    }

    // No changes above, so fall back to the original `normalizeNode`
    // to enforce other constraints.  Important to not call any normalize
    // if there were any changes, since they can make the entry invalid!
    normalizeNode(entry);
  };

  return editor;
};

// This does get called if you somehow blank the document. It
// gets called with path=[], which makes perfect sense.  If we
// don't put something in, then things immediately break due to
// selection assumptions.  Slate doesn't do this automatically,
// since it doesn't nail down the internal format of a blank document.
NORMALIZERS.push(function ensureDocumentNonempty({ editor }) {
  if (editor.children.length == 0) {
    Editor.insertNode(editor, emptyParagraph());
  }
});

// Ensure every list_item is contained in a list.
NORMALIZERS.push(function ensureListItemInAList({ editor, node, path }) {
  if (Element.isElement(node) && node.type === "list_item") {
    const [parent] = Editor.parent(editor, path);
    if (!isListElement(parent)) {
      // invalid document: every list_item should be in a list.
      Transforms.wrapNodes(editor, { type: "bullet_list" } as Element, {
        at: path,
      });
    }
  }
});

// Ensure every immediate child of a list is a list_item. Also, ensure
// that the children of each list_item are block level elements, since this
// makes list manipulation much easier and more consistent.
NORMALIZERS.push(function ensureListContainsListItems({ editor, node, path }) {
  if (
    Element.isElement(node) &&
    (node.type === "bullet_list" || node.type == "ordered_list")
  ) {
    let i = 0;
    for (const child of node.children) {
      if (!Element.isElement(child) || child.type != "list_item") {
        // invalid document: every child of a list should be a list_item
        Transforms.wrapNodes(editor, { type: "list_item" } as Element, {
          at: path.concat([i]),
          mode: "lowest",
        });
        return;
      }
      if (!Element.isElement(child.children[0])) {
        // if the the children of the list item are leaves, wrap
        // them all in a paragraph (for consistency with what our
        // convertor from markdown does, and also our doc manipulation,
        // e.g., backspace, assumes this).
        Transforms.wrapNodes(editor, { type: "paragraph" } as Element, {
          mode: "lowest",
          match: (node) => !Element.isElement(node),
          at: path.concat([i]),
        });
      }
      i += 1;
    }
  }
});

/*
Trim *all* whitespace from the beginning of blocks whose first child is Text,
since markdown doesn't allow for it. (You can use &nbsp; of course.)
*/
NORMALIZERS.push(function trimLeadingWhitespace({ editor, node, path }) {
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
});

/*
If there are two adjacent lists of the same type, merge the second one into
the first.
*/
NORMALIZERS.push(function mergeAdjacentLists({ editor, node, path }) {
  if (
    Element.isElement(node) &&
    (node.type === "bullet_list" || node.type === "ordered_list")
  ) {
    try {
      const nextPath = Path.next(path);
      const nextNode = getNodeAt(editor, nextPath);
      if (Element.isElement(nextNode) && nextNode.type == node.type) {
        // We have two adjacent lists of the same type: combine them.
        // Note that we do NOT take into account tightness when deciding
        // whether to merge, since in markdown you can't have a non-tight
        // and tight list of the same type adjacent to each other anyways.
        Transforms.mergeNodes(editor, { at: nextPath });
        return;
      }
    } catch (_) {} // because prev or next might not be defined

    try {
      const previousPath = Path.previous(path);
      const previousNode = getNodeAt(editor, previousPath);
      if (Element.isElement(previousNode) && previousNode.type == node.type) {
        Transforms.mergeNodes(editor, { at: path });
      }
    } catch (_) {}
  }
});

// Delete any empty links (with no text content), since you can't see them.
// This is a questionable design choice, e.g,. maybe people want to use empty
// links as a comment hack, as explained here:
//  https://stackoverflow.com/questions/4823468/comments-in-markdown
// However, those are the footnote style links.  The inline ones don't work
// anyways as soon as there is a space.
NORMALIZERS.push(function removeEmptyLinks({ editor, node, path }) {
  if (
    Element.isElement(node) &&
    node.type === "link" &&
    node.children.length == 1 &&
    node.children[0]?.["text"] === ""
  ) {
    Transforms.removeNodes(editor, { at: path });
  }
});
