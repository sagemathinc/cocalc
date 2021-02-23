/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Editor, Point } from "slate";
import { ReactEditor } from "./slate-react";
import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";
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

function insertSentinel(pos: CodeMirror.Position, markdown: string): string {
  const v = markdown.split("\n");
  const s = v[pos.line];
  if (s == null) {
    return markdown + SENTINEL;
  }
  v[pos.line] = s.slice(0, pos.ch) + SENTINEL + s.slice(pos.ch);
  return v.join("\n");
}

function findSentinel(doc: any[]): Point | undefined {
  let j = 0;
  for (const node of doc) {
    if (node.text != null) {
      const offset = node.text.indexOf(SENTINEL);
      if (offset != -1) {
        return { path: [j], offset };
      }
    }
    if (node.children != null) {
      const x = findSentinel(node.children);
      if (x != null) {
        return { path: [j].concat(x.path), offset: x.offset };
      }
    }
    j += 1;
  }
}

// Convert a markdown string and point in it (in codemirror {line,ch})
// to corresponding slate editor coordinates.
// TODO/Huge CAVEAT -- right now we add in some blank paragraphs to the
// slate document to make it possible to do something things with the cursor,
// get before the first bullet point or code block in a document.  These paragraphs
// are unknown to this conversion function... so if there are any then things are
// off as a result.   Obviously, we need to get rid of the code (in control.ts) that
// adds these and come up with a better approach to make cursors and source<-->editable sync
// work perfectly.
export function markdownPositionToSlatePoint({
  markdown,
  pos,
}: {
  markdown: string;
  pos: CodeMirror.Position | undefined;
}): Point | undefined {
  if (pos == null) return undefined;
  const m = insertSentinel(pos, markdown);
  if (m == null) {
    return undefined;
  }
  const doc = markdown_to_slate(m);
  let point = findSentinel(doc);
  if (point != null) return point;
  if (pos.ch == 0) return undefined;

  // try again at beginning of line, e.g., putting a sentinel
  // in middle of an html fragment not likely to work, but beginning
  // of line highly likely to work.
  return markdownPositionToSlatePoint({
    markdown,
    pos: { line: pos.line, ch: 0 },
  });
}

export function scrollIntoView(editor: ReactEditor, point: Point): void {
  const [node] = Editor.node(editor, point);
  ReactEditor.toDOMNode(editor, node).scrollIntoView({ block: "center" });
}
