/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
- Display of other user's cursors
- Broadcast of own cursor.

One complication is that there's both a plain source code
view and an editable view, and clients could be using either,
so we want to show cursors in both places.

TODO:

- [ ] display cursors in slate editor (not just source)
   - [ ] a way to display them
   - [ ] convert coordinates from markdown to slate
        - will also be useful for implementing forward search

- [ ] special cases for working with void elements
   - [ ] code blocks
   - [ ] checkboxes
   - [ ] images, etc?
*/

import { debounce } from "lodash";
import * as CodeMirror from "codemirror";
import { useCallback, useRef } from "react";
import { Point } from "slate";
import { ReactEditor } from "./slate-react";
import { slatePointToMarkdownPosition } from "./sync";

// Cursor broadcast can be expensive since we convert the cursor
// from slate coordinates to markdown coordinates each time,
// and we currently do this by converting the entire slate
// document to markdown, which can take a few ms.
const UPDATE_DEBOUNCE_MS = 1500;

interface Options {
  editor: ReactEditor;
  broadcastCursors: (locs: any[]) => void;
}

export const useCursors: (Options) => { onChange: () => void } = ({
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
        // broadcasts the merged information, since both are useful to other clients
        const { line, ch } = markdownPositionRef.current;
        broadcastCursors([{ x: ch, y: line, slate: focusPointRef.current }]);
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
    )
      return;
    focusPointRef.current = newFocus;
    update();
  };

  return { onChange };
};
