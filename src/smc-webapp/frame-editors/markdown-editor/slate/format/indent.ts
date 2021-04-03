/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Location, Path, Transforms } from "slate";
import { isListElement } from "../elements/list";
import { emptyParagraph } from "../padding";

export function unindentListItem(editor: Editor): boolean {
  const [item, path] = getParent(editor, (node) => node.type == "list_item");
  if (item == null || path == null) {
    // no list item containing cursor...
    return false;
  }
  if (!item.children) {
    // this shouldn't happen since all list_item's should
    // have children
    return false;
  }

  const [list, listPath] = getParent(editor, isListElement);
  if (list == null || listPath == null) {
    // shouldn't happen, since list_item should be inside of an actual list.
    return false;
  }

  // Now the parent of that list itself has to be a list item
  // to be able to unindent.
  const parentOfListPath = Path.parent(listPath);
  const [parentOfList] = Editor.node(editor, parentOfListPath);
  if (!Element.isElement(parentOfList) || parentOfList.type != "list_item") {
    // can only unindent if is a list inside a list item
    return false;
  }
  const to = Path.next(parentOfListPath);

  Editor.withoutNormalizing(editor, () => {
    Transforms.moveNodes(editor, {
      to,
      match: (node) => node === list,
    });
    Transforms.unwrapNodes(editor, { at: to });
  });

  return true;
}

function getParent(
  editor,
  match,
  at: Location | undefined = undefined
): [Element, number[]] | [undefined, undefined] {
  for (const elt of Editor.nodes(editor, {
    mode: "lowest",
    match: (node) => Element.isElement(node) && match(node),
    at,
  })) {
    return [elt[0] as Element, elt[1]];
  }
  return [undefined, undefined];
}

export function indentListItem(editor: Editor): boolean {
  const [item, path] = getParent(editor, (node) => node.type == "list_item");
  if (item == null || path == null) {
    // no list item containing cursor...
    return false;
  }
  if (!item.children) {
    // this shouldn't happen since all list_item's should
    // have children
    return false;
  }

  const [list] = getParent(editor, isListElement);
  if (list == null) {
    // shouldn't happen, since list_item should be inside of an actual list.
    return false;
  }

  if (list.children[0] === item) {
    // can't indent the first item
    return false;
  }

  const prevPath = Path.previous(path);
  const [prevItem] = Editor.node(editor, prevPath);
  if (!Element.isElement(prevItem)) {
    // should not happen
    return false;
  }
  if (
    prevItem.children.length > 0 &&
    !Element.isElement(prevItem.children[prevItem.children.length - 1])
  ) {
    // we can't stick our list item adjacent to a leaf node (e.g.,
    // not next to a text node). This naturally happens, since an
    // empty list item is parsed without a block child in it.
    Transforms.wrapNodes(editor, emptyParagraph() as any, {
      at: prevPath.concat(0),
    });
  }
  const to = prevPath.concat([prevItem.children.length]);

  if (list.type != "bullet_list" && list.type != "ordered_list") {
    // This should not happen, but it makes typescript
    //  happier below when wrapping.
    return false;
  }
  Editor.withoutNormalizing(editor, () => {
    Transforms.moveNodes(editor, {
      to,
      match: (node) => node === item,
    });
    Transforms.wrapNodes(
      editor,
      { type: list.type, tight: true, children: [] },
      { at: to }
    );
  });

  return true;
}
