/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit arrow keys.
*/

import { Transforms } from "slate";
import { register } from "./register";
import {
  blocksCursor,
  moveCursorUp,
  moveCursorDown,
  moveCursorToBeginningOfBlock,
} from "../control";
import { SlateEditor } from "../types";
import { ReactEditor } from "../slate-react";

const down = ({ editor }: { editor: SlateEditor }) => {
  const cur = editor.selection?.focus;

  try {
    const index = cur?.path[0];
    if (
      editor.windowedListRef.current != null &&
      cur != null &&
      index != null &&
      cur.path[1] == editor.children[cur.path[0]]["children"]?.length - 1
    ) {
      // moving to the next block:
      if (editor.scrollIntoDOM(index + 1)) {
        // we did actually have to scroll the block below current one into the dom.
        setTimeout(() => {
          // did cursor move? -- if not, we manually move it.
          if (cur == editor.selection?.focus) {
            moveCursorDown(editor, true);
            moveCursorToBeginningOfBlock(editor);
          }
        }, 0);
      }
    }
    if (ReactEditor.selectionIsInDOM(editor)) {
      // just work in the usual way
      if (!blocksCursor(editor, false)) {
        // built in cursor movement works fine
        return false;
      }
      moveCursorDown(editor, true);
      moveCursorToBeginningOfBlock(editor);
      return true;
    } else {
      // in case of windowing when actual selection is not even
      // in the DOM, it's much better to just scroll it into view
      // and not move the cursor at all than to have it be all
      // wrong (which is what happens with contenteditable and
      // selection change).  I absolutely don't know how to
      // subsequently move the cursor down programatically in
      // contenteditable, and it makes no sense to do so in slate
      // since the semantics of moving down depend on the exact rendering.
      return true;
    }
  } finally {
    setTimeout(() => {
      if (cur != null && cur == editor.selection?.focus) {
        // it is VERY bad for the cursor to be completely stuck... so we ensure
        // this can't happen here.
        const n = editor.selection.focus.path[0];
        if (n < editor.children.length - 1) {
          Transforms.setSelection(editor, {
            focus: { path: [n + 1, 0], offset: 0 },
            anchor: { path: [n + 1, 0], offset: 0 },
          });
        } else {
          // TODO/NOTE: this is incompatible with windowing (see similar code above, which would conflict with this).
          editor.onCursorBottom?.();
        }
      }
    }, 0);
  }
};

register({ key: "ArrowDown" }, down);

const up = ({ editor }: { editor: SlateEditor }) => {
  const cur = editor.selection?.focus;
  try {
    const index = cur?.path[0];
    if (editor.windowedListRef.current != null && index && cur.path[1] == 0) {
      if (editor.scrollIntoDOM(index - 1)) {
        setTimeout(() => {
          if (cur == editor.selection?.focus) {
            moveCursorUp(editor, true);
            moveCursorToBeginningOfBlock(editor);
          }
        }, 0);
      }
    }
    if (ReactEditor.selectionIsInDOM(editor)) {
      if (!blocksCursor(editor, true)) {
        // built in cursor movement works fine
        return false;
      }
      moveCursorUp(editor, true);
      moveCursorToBeginningOfBlock(editor);
      return true;
    } else {
      return true;
    }
  } finally {
    if (cur != null && editor.onCursorTop != null) {
      // check if attempt to move cursor did nothing in the next
      // render loop (after selection gets sync'd).  If so, that
      // means we are at the top of the document, so we call a
      // function to handle that.
      // TODO/NOTE: this is incompatible with windowing (see similar code above, which would conflict with this).
      setTimeout(() => {
        if (cur == editor.selection?.focus) {
          editor.onCursorTop?.();
        }
      }, 0);
    }
  }
};

register({ key: "ArrowUp" }, up);

/*
The following functions are needed when using windowing, since
otherwise page up/page down get stuck when the rendered window
is at the edge.  This is unavoidable, even if we were to
render a big overscan. If scrolling doesn't move, the code below
forces a manual move by one page.

NOTE/TODO: none of the code below moves the *cursor*; it only
moves the scroll position on the page.  In contrast, word,
google docs and codemirror all move the cursor when you page up/down,
so maybe that should be implemented...?
*/

function pageWindowed(sign) {
  return ({ editor }) => {
    const scroller = editor.windowedListRef.current?.getScrollerRef();
    if (scroller == null) return false;
    const { scrollTop } = scroller;

    setTimeout(() => {
      if (scrollTop == scroller.scrollTop) {
        scroller.scrollTop += sign * scroller.getBoundingClientRect().height;
      }
    }, 0);

    return false;
  };
}

const pageUp = pageWindowed(-1);
register({ key: "PageUp" }, pageUp);

const pageDown = pageWindowed(1);
register({ key: "PageDown" }, pageDown);

function beginningOfDoc({ editor }) {
  const scroller = editor.windowedListRef.current?.getScrollerRef();
  if (scroller == null) return false;
  scroller.scrollTop = 0;
  return true;
}
function endOfDoc({ editor }) {
  const scroller = editor.windowedListRef.current?.getScrollerRef();
  if (scroller == null) return false;
  scroller.scrollTop = 1e20; // basically infinity
  // might have to do it again do to measuring size of rows...
  setTimeout(() => {
    scroller.scrollTop = 1e20;
  }, 1);
  return true;
}
register({ key: "ArrowUp", meta: true }, beginningOfDoc); // mac
register({ key: "Home", ctrl: true }, beginningOfDoc); // windows
register({ key: "ArrowDown", meta: true }, endOfDoc); // mac
register({ key: "End", ctrl: true }, endOfDoc); // windows
