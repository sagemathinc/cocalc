/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Location, Path, Transforms } from "slate";
import { isListElement } from "../elements/list";
import { emptyParagraph } from "../padding";

export function unindentListItem(editor: Editor): boolean {
  const [item, path] = getNode(editor, (node) => node.type == "list_item");
  if (item == null || path == null) {
    // no list item containing cursor...
    return false;
  }
  if (!item.children) {
    // this shouldn't happen since all list_item's should
    // have children
    return false;
  }

  const [list, listPath] = getNode(editor, isListElement);
  if (list == null || listPath == null) {
    // shouldn't happen, since list_item should be inside of an actual list.
    return false;
  }

  // Now the parent of that list itself has to be a list item
  // to be able to unindent.
  const parentOfListPath = Path.parent(listPath);
  const [parentOfList] = Editor.node(editor, parentOfListPath);

  if (!Element.isElement(parentOfList) || parentOfList.type != "list_item") {
    // Top level list item.  Remove bullet point and make it
    // no longer a list item at all.
    let to = Path.parent(path);
    if (Path.hasPrevious(path)) {
      to = Path.next(to);
    }
    try {
      Editor.withoutNormalizing(editor, () => {
        if (path[path.length - 1] < list.children.length - 1) {
          // not last child so split
          Transforms.splitNodes(editor, {
            match: (node) => Element.isElement(node) && isListElement(node),
            mode: "lowest",
          });
        }
        Transforms.moveNodes(editor, {
          match: (node) => node === item,
          to,
        });
        Transforms.unwrapNodes(editor, {
          match: (node) => node === item,
          mode: "lowest",
          at: to,
        });
      });
    } catch (err) {
      console.warn(`SLATE -- issue making list item ${err}`);
    }
    return true;
  }

  const to = Path.next(parentOfListPath);

  try {
    Editor.withoutNormalizing(editor, () => {
      Transforms.moveNodes(editor, {
        to,
        match: (node) => node === list,
      });
      Transforms.unwrapNodes(editor, { at: to });
    });
  } catch (err) {
    console.warn(`SLATE -- issue with unindentListItem ${err}`);
  }

  // re-indent any extra siblings that we just unintentionally un-indented
  // Yes, I wish there was a simpler way than this, but fortunately this
  // is not a speed critical path for anything.
  const numBefore = path[path.length - 1];
  const numAfter = list.children.length - numBefore - 1;
  for (let i = 0; i < numBefore; i++) {
    indentListItem(editor, to);
  }
  const after = Path.next(to);
  for (let i = 0; i < numAfter; i++) {
    indentListItem(editor, after);
  }

  return true;
}

function getNode(
  editor,
  match,
  at: Location | undefined = undefined
): [Element, number[]] | [undefined, undefined] {
  if (at != null) {
    // First try the node at *specific* given position.
    // For some reason there seems to be no mode
    // with Editor.nodes that does this, but we use
    // this for re-indenting in the unindent code above.
    try {
      const [elt, path] = Editor.node(editor, at);
      if (Element.isElement(elt) && match(elt, path)) {
        return [elt as Element, path];
      }
    } catch (_err) {
      // no such element, so try search below...
    }
  }
  for (const elt of Editor.nodes(editor, {
    match: (node, path) => Element.isElement(node) && match(node, path),
    mode: "lowest",
    at,
  })) {
    return [elt[0] as Element, elt[1]];
  }
  return [undefined, undefined];
}

export function indentListItem(
  editor: Editor,
  at: Location | undefined = undefined
): boolean {
  const [item, path] = getNode(editor, (node) => node.type == "list_item", at);
  if (item == null || path == null) {
    // console.log("no list item containing cursor...");
    return false;
  }
  if (!item.children) {
    // console.log("this shouldn't happen since all list_item's should have children");
    return false;
  }

  const [list] = getNode(editor, isListElement, at);
  if (list == null) {
    // console.log("shouldn't happen, since list_item should be inside of an actual list.");
    return false;
  }

  if (list.children[0] === item || path[path.length - 1] == 0) {
    // console.log("can't indent the first item", { list, path, item });
    return false;
  }

  const prevPath = Path.previous(path);
  const [prevItem] = Editor.node(editor, prevPath);
  if (!Element.isElement(prevItem)) {
    // console.log("type issue -- should not happen");
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
    // console.log("Type issue that should not happen.");
    return false;
  }
  try {
    Editor.withoutNormalizing(editor, () => {
      Transforms.moveNodes(editor, {
        to,
        match: (node) => node === item,
        at,
      });
      Transforms.wrapNodes(
        editor,
        { type: list.type, tight: true, children: [] },
        { at: to }
      );
    });
  } catch (err) {
    console.warn(`SLATE -- issue with indentListItem ${err}`);
  }

  return true;
}
