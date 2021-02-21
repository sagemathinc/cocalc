/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Editor, Point } from "slate";
import { slate_to_markdown } from "./slate-to-markdown";
const SENTINEL = "\uFE30";

export function slatePointToMarkdownPosition(
  editor: Editor,
  point: Point | undefined
): CodeMirror.Position | undefined {
  if (point == null) return undefined; // easy special case not handled below.
  const { index, markdown } = slatePointToMarkdown(editor, point);
  if (index == -1) return;
  return indexToPosition({ index, markdown });
}

// Given a location in a slatejs document, return the
// corresponding index into the corresponding markdown document,
// along with the version of the markdown file that was used for
// this determination.
// Returns index of -1 if it fails to work for some reason, e.g.,
// the point doesn't exist in the document.
export function slatePointToMarkdown(
  editor: Editor,
  point: Point
): { index: number; markdown: string } {
  let node;
  try {
    [node] = Editor.node(editor, point);
  } catch (err) {
    // There is no guarantee that point is valid when this is called.
    return { index: -1, markdown: "" };
  }

  let markdown = slate_to_markdown(editor.children, {
    hook: (elt, s) => {
      if (elt !== node) return;
      return s.slice(0, point.offset) + SENTINEL + s.slice(point.offset);
    },
  });
  const index = markdown.indexOf(SENTINEL);
  if (index != -1) {
    markdown = markdown.slice(0, index) + markdown.slice(index + 1);
  }
  return { markdown, index };
}

export function indexToPosition({
  index,
  markdown,
}: {
  index: number;
  markdown: string;
}): CodeMirror.Position | undefined {
  let n = 0;
  const lines = markdown.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const len = lines[line].length + 1; // +1 for the newlines.
    const next = n + len;
    if (index >= n && index < next) {
      // in this line
      return { line, ch: index - n };
    }
    n = next;
  }
  // not found...?
  return undefined; // just being explicit here.
}
