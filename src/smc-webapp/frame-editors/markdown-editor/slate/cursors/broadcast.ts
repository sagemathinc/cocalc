/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Broadcast of own cursor.

// NOTE: We use plural "cursors" here in the optimistic hope that
// we'll somehow implement a notion of multiple cursors for slate.
// Hmm, that already exists for a single code cell, doesn't it, due
// to codemirror.

import { debounce } from "lodash";
import * as CodeMirror from "codemirror";
import { useCallback, useRef } from "react";
import { Point } from "slate";
import { ReactEditor } from "../slate-react";
import { slatePointToMarkdownPosition } from "../sync";

// Cursor broadcast can be expensive since we convert the cursor
// from slate coordinates to markdown coordinates each time,
// and we currently do this by converting the entire slate
// document to markdown, which can take a few ms.
const UPDATE_DEBOUNCE_MS = 1500;

interface Options {
  editor: ReactEditor;
  broadcastCursors: (locs: any[]) => void;
}

export const useBroadcastCursors: (Options) => () => void = ({
  editor,
  broadcastCursors,
}) => {
  const focusPointRef = useRef<Point | undefined>(undefined);
  const markdownPositionRef = useRef<CodeMirror.Position | undefined>(
    undefined
  );

  const update = useCallback(
    debounce(() => {
      markdownPositionRef.current = slatePointToMarkdownPosition(
        editor,
        focusPointRef.current
      );
      if (
        markdownPositionRef.current != null &&
        focusPointRef.current != null
      ) {
        const { line, ch } = markdownPositionRef.current;
        broadcastCursors([{ x: ch, y: line }]);
      }
    }, UPDATE_DEBOUNCE_MS),
    []
  );

  const onChange = () => {
    if (!ReactEditor.isFocused(editor)) return;
    const newFocus = editor.selection?.focus;
    if (newFocus == null) return;
    if (
      focusPointRef.current != null &&
      Point.equals(newFocus, focusPointRef.current)
    ) {
      // cursor didn't change (or not collapsed)
      return;
    }
    focusPointRef.current = newFocus;
    // ensure *user* cursor is visible.  (TODO: This is not naturally placed here, but
    // putting it here for now since we need the above "cursor changed" logic.  We
    // can move that elsewhere (e.g., and event) and then move this.)
    editor.scrollCaretIntoView();
    // and update/broadcast out.
    update();
  };

  return onChange;
};
