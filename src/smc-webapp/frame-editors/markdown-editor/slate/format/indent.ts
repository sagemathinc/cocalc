/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Element, Transforms } from "slate";
import { slate_to_markdown } from "../slate-to-markdown";
import { markdown_to_slate } from "../markdown-to-slate";
import { slateDiff } from "../slate-diff";
import { applyOperations } from "../operations";

const SENTINEL = "\uFE30";

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

export function indentListItem(editor: Editor): boolean {
  const x = findParentOfType(editor, "list_item");
  if (x == null) {
    // no list item containing cursor...
    return false;
  }
  const [node] = x;
  let empty_hack: boolean = false;
  if (node.children)
    if (
      !changeViaMarkdown(editor, {
        nodeHook: (elt, s) => {
          if (elt !== node) return;
          if (s.trim() == "-") {
            // Markdown interprets an indented list with nothing in
            // the first item as making the previous line a header.
            // However, people might like to hit tab to indent the
            // first sub-list-item before they start typing.  The only
            // technically correct normalized way to deal with this is to make
            // a list item with an nbsp in it.
            // Combined with moving the cursor back below, this results
            // in one weird trailing space, which has no ill effects.
            empty_hack = true;
            s = "- &#32;";
          }
          return "  " + s;
        },
      })
    ) {
      return false;
    }
  if (empty_hack) {
    // delete that blank space we had to add due to limitations in markdown.
    editor.deleteBackward("character");
  }
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
        if (md.slice(i - 2, i) != "  ") {
          // not spaces - no-op
          return undefined;
        }
        return md.slice(0, i - 2) + md.slice(i + 1);
      },
    })
  )
    return false;

  // move cursor back to line we just unindented.
  Transforms.move(editor, { distance: 1, unit: "line" });
  return true;
}
