/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node, Location, Editor, Range, Path } from "slate";

export function containingBlock(editor: Editor): undefined | [Node, Location] {
  for (const x of Editor.nodes(editor, {
    match: (node) => Editor.isBlock(editor, node),
  })) {
    return x;
  }
}

export function getNodeAt(editor: Editor, path: Path): undefined | Node {
  try {
    return Editor.node(editor, path)[0];
  } catch (_) {
    return;
  }
}

// Range that contains the entire document.
export function rangeAll(editor: Editor): Range {
  const first = Editor.first(editor, []);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0; // TODO: not 100% that this is right
  return {
    anchor: { path: first[1], offset: 0 },
    focus: { path: last[1], offset },
  };
}

// Range that goes from selection focus to
// end of the document.
export function rangeToEnd(editor: Editor): Range {
  if (editor.selection == null) return rangeAll(editor);
  const last = Editor.last(editor, []);
  const offset = last[0]["text"]?.length ?? 0;
  return {
    anchor: editor.selection.focus,
    focus: { path: last[1], offset },
  };
}

export function rangeFromStart(editor: Editor): Range {
  if (editor.selection == null) return rangeAll(editor);
  const first = Editor.first(editor, []);
  return {
    anchor: { path: first[1], offset: 0 },
    focus: editor.selection.focus,
  };
}
