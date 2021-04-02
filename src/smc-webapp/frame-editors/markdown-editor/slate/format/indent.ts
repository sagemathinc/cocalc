/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Path, Transforms } from "slate";
import { isListElement } from "../elements/list";
import { slate_to_markdown } from "../slate-to-markdown";
import { markdown_to_slate } from "../markdown-to-slate";
import { slateDiff } from "../slate-diff";
import { applyOperations } from "../operations";
import { emptyParagraph } from "../padding";

const SENTINEL = "\uFE30";
const LIST_INDENT = "  "; // 2 spaces

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

function changeViaMarkdown(
  editor,
  hooks: {
    nodeHook?: (Node, string) => string | undefined;
    markdownHook?: (string) => string;
  }
): boolean {
  let md = slate_to_markdown(editor.children, { hook: hooks.nodeHook });
  if (hooks.markdownHook != null) {
    const md2 = hooks.markdownHook(md);
    if (md2 == null) {
      return false;
    } else {
      md = md2;
    }
  }
  const doc = markdown_to_slate(md);
  const operations = slateDiff(editor.children, doc);
  applyOperations(editor, operations);
  return true;
}

export function unindentListItem(editor: Editor): boolean {
  const x = findParentOfType(editor, "list_item");
  if (x == null) {
    // no list item containing cursor...
    return false;
  }
  const [node] = x;
  if (
    !changeViaMarkdown(editor, {
      nodeHook: (elt, s) => {
        if (elt !== node) return;
        return SENTINEL + s;
      },
      markdownHook: (md) => {
        const i = md.indexOf(SENTINEL);
        if (i == -1) return false;
        if (md.slice(i - LIST_INDENT.length, i) != LIST_INDENT) {
          // not spaces - no-op
          return undefined;
        }
        return md.slice(0, i - LIST_INDENT.length) + md.slice(i + 1);
      },
    })
  )
    return false;

  // move cursor back to line we just unindented.
  Transforms.move(editor, { distance: 1, unit: "line" });
  return true;
}

function getParent(
  editor,
  match
): [Element, number[]] | [undefined, undefined] {
  for (const elt of Editor.nodes(editor, {
    mode: "lowest",
    match: (node) => Element.isElement(node) && match(node),
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
