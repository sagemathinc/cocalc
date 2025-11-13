/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Editor, Element, Path, Transforms } from "slate";
import { getNode } from "./indent";

export function moveListItemUp(editor: Editor): boolean {
  const [item, path] = getNode(editor, (node) => node.type == "list_item");
  if (item == null || path == null) {
    // no list item containing cursor...
    return false;
  }
  if (!Path.hasPrevious(path)) {
    // already first
    return false;
  }
  Transforms.moveNodes(editor, {
    match: (node) => Element.isElement(node) && node.type == "list_item",
    to: Path.previous(path),
  });

  return true;
}

export function moveListItemDown(editor: Editor): boolean {
  const [item, path] = getNode(editor, (node) => node.type == "list_item");
  if (item == null || path == null) {
    // no list item containing cursor...
    return false;
  }
  Transforms.moveNodes(editor, {
    match: (node) => Element.isElement(node) && node.type == "list_item",
    to: Path.next(path),
  });
  return true;
}
