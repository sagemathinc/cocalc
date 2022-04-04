/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Descendant, Editor, Point } from "slate";
import { ReactEditor } from "./slate-react";
import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";
import { isWhitespaceParagraph } from "./padding";
const SENTINEL = "\uFE30";
import { SlateEditor } from "./editable-markdown";

export function slatePointToMarkdownPosition(
  editor: SlateEditor,
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
// TODO/BUG: This can still be slightly wrong because we don't use caching on the top-level
// block that contains the cursor.  Thus, e.g., in a big nested list with various markdown
// that isn't canonical this could make things be slightly off.
export function slatePointToMarkdown(
  editor: SlateEditor,
  point: Point
): { index: number; markdown: string } {
  let node;
  try {
    [node] = Editor.node(editor, point);
  } catch (err) {
    console.warn(`slate -- invalid point ${point} -- ${err}`);
    // There is no guarantee that point is valid when this is called.
    return { index: -1, markdown: "" };
  }

  let markdown = slate_to_markdown(editor.children, {
    cache: editor.syncCache,
    noCache: new Set([point.path[0]]),
    hook: (elt) => {
      if (elt !== node) return;
      return (s) => s.slice(0, point.offset) + SENTINEL + s.slice(point.offset);
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
  editor,
}: {
  markdown: string;
  pos: CodeMirror.Position | undefined;
  editor: SlateEditor;
}): Point | undefined {
  if (pos == null) return undefined;
  const m = insertSentinel(pos, markdown);
  if (m == null) {
    return undefined;
  }
  const doc: Descendant[] = markdown_to_slate(m, false);
  let point = findSentinel(doc);
  if (point != null) return normalizePoint(editor, doc, point);
  if (pos.ch == 0) return undefined;

  // try again at beginning of line, e.g., putting a sentinel
  // in middle of an html fragment not likely to work, but beginning
  // of line highly likely to work.
  return markdownPositionToSlatePoint({
    markdown,
    pos: { line: pos.line, ch: 0 },
    editor,
  });
}

export async function scrollIntoView(
  editor: ReactEditor,
  point: Point
): Promise<void> {
  const scrollIntoView = () => {
    try {
      const [node] = Editor.node(editor, point);
      const elt = ReactEditor.toDOMNode(editor, node);
      elt.scrollIntoView({ block: "center" });
    } catch (_err) {
      // There is no guarantee the point is valid, or that
      // the DOM node exists.
    }
  };
  if (!ReactEditor.isUsingWindowing(editor)) {
    scrollIntoView();
  } else {
    // TODO: this below makes it so the top of the top-level block containing
    // the point is displayed.  However, that block could be big, and we
    // really need to somehow move down to it via some scroll offset.
    // There is an offset option to scrollToIndex (see use in preserveScrollPosition),
    // and that might be very helpful.
    const index = point.path[0];
    editor.windowedListRef.current?.virtuosoRef.current?.scrollToIndex({
      index,
      align: "center",
    });
    setTimeout(scrollIntoView, 0);
    requestAnimationFrame(() => {
      scrollIntoView();
      setTimeout(scrollIntoView, 0);
    });
  }
}

function normalizePoint(
  editor: Editor,
  doc: Descendant[],
  point: Point
): Point | undefined {
  // On the slate side at the top level we create blank paragraph to make it possible to
  // move the cursor before/after various block elements.  In practice this seems to nicely
  // workaround a lot of maybe fundamental bugs/issues with Slate, like those
  // hinted at here:  https://github.com/ianstormtaylor/slate/issues/3469
  // But it means we also have to account for this when mapping from markdown
  // coordinates to slate coordinates, or other user cursors and forward search
  // will be completely broken.  These disappear when generating markdown from
  // slate, so cause no trouble in the other direction.
  if (doc.length < editor.children.length) {
    // only an issue when lengths are different; in the common special case they
    // are the same (e.g., maybe slate only used to view, not edit), then this
    // can't be an issue.
    let i = 0,
      j = 0;
    while (i <= point.path[0]) {
      if (
        isWhitespaceParagraph(editor.children[j]) &&
        !isWhitespaceParagraph(doc[i])
      ) {
        point.path[0] += 1;
        j += 1;
        continue;
      }
      i += 1;
      j += 1;
    }
  }

  // If position is at the very end of a line with marking our process to find it
  // creates a new text node, so cursor gets lost, so we move back 1 position
  // and try that.  This is a heuristic to make one common edge case work.
  try {
    Editor.node(editor, point);
  } catch (_err) {
    point.path[point.path.length - 1] -= 1;
    if (point.path[point.path.length - 1] >= 0) {
      try {
        // this goes to the end of it or raises an exception if
        // there's no point here.
        return Editor.after(editor, point, { unit: "line" });
      } catch (_err) {
        return undefined;
      }
    }
  }
  return point;
}
