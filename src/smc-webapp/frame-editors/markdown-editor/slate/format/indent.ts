/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Transforms } from "slate";

function findParentOfType(
  editor,
  type: string
): [Element, number[]] | undefined {
  for (const elt of Editor.nodes(editor, {
    mode: "lowest",
    match: (node) => Element.isElement(node) && node.type == type,
  })) {
    return [elt[0] as Element, elt[1]];
  }
}

// Indenting a list item.
// - In Markdown this only makes sense to indent exactly one level.
//   There's no notion of indenting two levels.
// - We can't indent the very first item of a list (since then there)
//   is no parent item.
export function indentListItem(editor: Editor): boolean {
  // Find list_item containing the cursor.
  const x = findParentOfType(editor, "list_item");
  if (x == null) {
    // no list item containing cursor...
    return false;
  }
  const [, path] = x;
  if (path[path.length - 1] == 0) {
    // first item in a list -- can't indent it (not meaningful
    // in markdown)
    return false;
  }

  // Wrap the item in a new bullet_list.  Just doing this
  // will look right in the editor, but has no meaning in
  // markdown so does NOT convert back properly!
  Transforms.wrapNodes(
    editor,
    { type: "bullet_list", tight: true, children: [] } as Element,
    { at: path }
  );
  // We must also move that new bullet list we just created
  // to be the last child of the previous list item.
  const to = [...path];
  to[to.length - 1] -= 1; // nonnegative because of check above.
  // Need to find how many children the previous list item has
  // so we know where to position it.
  const [prev] = Editor.node(editor, { path: to, offset: 0 });
  if (prev == null || !Element.isElement(prev)) return false;
  to.push(prev.children.length);
  Transforms.moveNodes(editor, { at: path, to });
  return true;
}
