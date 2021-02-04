/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Point } from "slate";
import { slate_to_markdown } from "./slate-to-markdown";
const SENTINEL = "\uFE30";

// Given a location in a slatejs document, return the
// corresponding index into the corresponding markdown document,
// along with the version of the markdown file that was used for
// this determination.
// Returns undefined if it fails to work for some reason.
export function slatePointToMarkdown(
  editor: Editor,
  point: Point
): { index: number; markdown: string } {
  const [node] = Editor.node(editor, point);

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
}): { line: number; ch: number } {
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
  return { line: 0, ch: 0 };
}
