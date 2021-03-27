/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Node, Path, Point, Range, Transforms } from "slate";
import { rangeAll, rangeToEnd, rangeFromStart } from "../slate-util";

/* Find locations of all positions in the editor that match the search string. */

export function findMatches(
  editor: Editor,
  decorate: (x: [Node, Path]) => any[]
): any[] {
  const matches: any[] = [];
  for (const [node, path] of Editor.nodes(editor, {
    at: rangeAll(editor),
  })) {
    for (const match of decorate([node, path])) {
      matches.push(match);
    }
  }
  return matches;
}

function selectMatch(
  editor: Editor,
  decorate,
  options,
  above: boolean
): boolean {
  let cursor;
  if (editor.selection == null) {
    cursor = undefined;
  } else {
    const edges = Range.edges(editor.selection);
    cursor = above ? edges[0] : edges[1];
  }
  for (const [node, path] of Editor.nodes(editor, options)) {
    const dc = decorate([node, path]);
    if (options.reverse) {
      dc.reverse();
    }
    for (const match of dc) {
      if (
        cursor == null ||
        (!above && Point.equals(cursor, match.anchor)) ||
        (above && Point.isBefore(match.anchor, cursor)) ||
        (!above && Point.isAfter(match.anchor, cursor))
      ) {
        Transforms.setSelection(editor, {
          anchor: match.anchor,
          focus: match.focus,
        });
        return true;
      }
    }
  }
  return false;
}

export function selectNextMatch(editor: Editor, decorate) {
  {
    const { anchor, focus } = rangeToEnd(editor);
    const at = { focus, anchor: { path: anchor.path, offset: 0 } };
    if (selectMatch(editor, decorate, { at }, false)) return;
  }
  {
    const at = rangeFromStart(editor);
    if (selectMatch(editor, decorate, { at }, true)) return;
  }
}

export function selectPreviousMatch(editor: Editor, decorate) {
  {
    const { anchor, focus } = rangeFromStart(editor);
    const n = Editor.next(editor, { at: focus.path });
    const at = { anchor, focus: n != null ? n[1] : focus };
    if (selectMatch(editor, decorate, { at, reverse: true }, true)) return;
  }
  {
    const at = rangeToEnd(editor);
    if (selectMatch(editor, decorate, { at, reverse: true }, false)) return;
  }
}
