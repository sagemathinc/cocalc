import * as ReactDOM from "react-dom";
import { Editor, Node, Path, Operation, Transforms, Range } from "slate";

import { ReactEditor } from "./react-editor";
import { Key } from "../utils/key";
import { EDITOR_TO_ON_CHANGE, NODE_TO_KEY } from "../utils/weak-maps";
import { findCurrentLineRange } from "../utils/lines";
import { IS_FIREFOX } from "../utils/environment";
import { IS_ANDROID, IS_IOS } from "smc-webapp/feature";

/**
 * `withReact` adds React and DOM specific behaviors to the editor.
 */

export const withReact = <T extends Editor>(editor: T) => {
  const e = editor as T & ReactEditor;
  const { apply, onChange, deleteBackward } = e;

  e.windowedListRef = { current: null };

  e.deleteBackward = (unit) => {
    if (unit !== "line") {
      return deleteBackward(unit);
    }

    if (editor.selection && Range.isCollapsed(editor.selection)) {
      const parentBlockEntry = Editor.above(editor, {
        match: (n) => Editor.isBlock(editor, n),
        at: editor.selection,
      });

      if (parentBlockEntry) {
        const [, parentBlockPath] = parentBlockEntry;
        const parentElementRange = Editor.range(
          editor,
          parentBlockPath,
          editor.selection.anchor
        );

        const currentLineRange = findCurrentLineRange(e, parentElementRange);

        if (!Range.isCollapsed(currentLineRange)) {
          Transforms.delete(editor, { at: currentLineRange });
        }
      }
    }
  };

  e.apply = (op: Operation) => {
    const matches: [Path, Key][] = [];

    switch (op.type) {
      case "insert_text":
      case "remove_text":
      case "set_node": {
        for (const [node, path] of Editor.levels(e, { at: op.path })) {
          const key = ReactEditor.findKey(e, node);
          matches.push([path, key]);
        }

        break;
      }

      case "insert_node":
      case "remove_node":
      case "merge_node":
      case "split_node": {
        for (const [node, path] of Editor.levels(e, {
          at: Path.parent(op.path),
        })) {
          const key = ReactEditor.findKey(e, node);
          matches.push([path, key]);
        }

        break;
      }

      case "move_node": {
        for (const [node, path] of Editor.levels(e, {
          at: Path.common(Path.parent(op.path), Path.parent(op.newPath)),
        })) {
          const key = ReactEditor.findKey(e, node);
          matches.push([path, key]);
        }
        break;
      }
    }

    apply(op);

    for (const [path, key] of matches) {
      const [node] = Editor.node(e, path);
      NODE_TO_KEY.set(node, key);
    }
  };

  e.setFragmentData = (data: DataTransfer) => {
    const { selection } = e;

    if (!selection) {
      return;
    }

    const [start] = Range.edges(selection);
    const startVoid = Editor.void(e, { at: start.path });
    if (Range.isCollapsed(selection) && !startVoid) {
      return;
    }

    const fragment = e.getFragment();
    const plain = (e as any).getSourceValue?.(fragment);
    if (!plain) {
      // TODO: need to implement this
      return;
    }
    const string = JSON.stringify(fragment);
    const encoded = window.btoa(encodeURIComponent(string));

    // This application/x-slate-fragment is the only thing that is
    // used for Firefox and Chrome paste:
    data.setData("application/x-slate-fragment", encoded);
    // This data part of text/html is used for Safari, which ignores
    // the application/x-slate-fragment above.
    data.setData(
      "text/html",
      `<pre data-slate-fragment="${encoded}">\n${plain}\n</pre>`
    );
    data.setData("text/plain", plain);
  };

  e.insertData = (data: DataTransfer) => {
    let fragment = data.getData("application/x-slate-fragment");

    if (!fragment) {
      // On Safari (probably for security reasons?), the
      // application/x-slate-fragment data is not set.
      // My guess is this is why the html is also modified
      // even though it is never used in the upstream code!
      // See https://github.com/ianstormtaylor/slate/issues/3589
      // Supporting this is also important when copying from
      // Safari to Chrome (say).
      const html = data.getData("text/html");
      if (html) {
        // It would be nicer to parse html properly, but that's
        // going to be pretty difficult, so I'm doing the following,
        // which of course could be tricked if the content
        // itself happened to have data-slate-fragment="...
        // in it.  That's a reasonable price to pay for
        // now for restoring this functionality.
        let i = html.indexOf('data-slate-fragment="');
        if (i != -1) {
          i += 'data-slate-fragment="'.length;
          const j = html.indexOf('"', i);
          if (j != -1) {
            fragment = html.slice(i, j);
          }
        }
      }
    }

    if (fragment) {
      const decoded = decodeURIComponent(window.atob(fragment));
      const parsed = JSON.parse(decoded) as Node[];
      e.insertFragment(parsed);
      return;
    }

    const text = data.getData("text/plain");

    if (text) {
      const lines = text.split(/\r\n|\r|\n/);
      let split = false;

      for (const line of lines) {
        if (split) {
          Transforms.splitNodes(e, { always: true });
        }

        e.insertText(line);
        split = true;
      }
    }
  };

  e.onChange = () => {
    // COMPAT: React doesn't batch `setState` hook calls, which means that the
    // children and selection can get out of sync for one render pass. So we
    // have to use this unstable API to ensure it batches them. (2019/12/03)
    // https://github.com/facebook/react/issues/14259#issuecomment-439702367
    ReactDOM.unstable_batchedUpdates(() => {
      const onContextChange = EDITOR_TO_ON_CHANGE.get(e);

      if (onContextChange) {
        onContextChange();
      }

      onChange();
    });
  };

  e.scrollCaretIntoView = (options?: { middle?: boolean }) => {
    if (IS_ANDROID || IS_IOS) {
      // With touch input it is very confusing trying to scroll to a cursor,
      // which just doesn't make sense, because you aren't navigating with
      // the cursor.  NOTE/TODO: Unless you're using an external keyboard...?
      return;
    }
    /* Scroll so Caret is visible.  I tested several editors, and
     I think reasonable behavior is:
      - If caret is full visible on the screen, do nothing.
      - If caret is not visible, scroll so caret is at
        top or bottom. Word and Pages do this but with an extra line;
        CodeMirror does *exactly this*; some editors like Prosemirror
        and Typora scroll the caret to the middle of the screen,
        which is weird.  Since most of cocalc is codemirror, being
        consistent with that seems best.  The implementation is also
        very simple.

     This code below is based on what is
         https://github.com/ianstormtaylor/slate/pull/4023
     except that PR seems buggy and does the wrong thing, so I
     had to rewrite it.  I also wrote a version for windowing.

     I think properly implementing this is very important since it is
     critical to keep users from feeling *lost* when using the editor.
     If their cursor scrolls off the screen, especially in a very long line,
     they might move the cursor back or forward one space to make it visible
     again.  In slate with #4023, if you make a single LONG line (that spans
     more than a page with no formatting), then scroll the cursor out of view,
     then move the cursor, you often still don't see the cursor. That's
     because it just scrolls that entire leaf into view, not the cursor
     itself.
  */
    try {
      const { selection } = e;
      if (!selection) return;
      if (!Range.isCollapsed(selection)) return;

      // Important: there's no good way to do this when the focused
      // element is void, and the naive code leads to bad problems,
      // e.g., with several images, when you click on one, things jump
      // around randomly and you sometimes can't scroll the image into view.
      // Better to just do nothing in case of voids.
      for (const [node] of Editor.nodes(e, { at: selection.focus })) {
        if (Editor.isVoid(e, node)) {
          return;
        }
      }

      // In case we're using windowing, scroll the block with the focus
      // into the DOM first.
      let windowed: boolean = e.windowedListRef.current != null;
      if (windowed) {
        const info = e.windowedListRef.current.render_info;
        const index = selection.focus.path[0];
        if (info != null && index != null) {
          const { overscanStartIndex, overscanStopIndex } = info;
          if (index < overscanStartIndex || index > overscanStopIndex) {
            e.windowedListRef.current.scrollToItem(index);
            // now wait until the actual scroll happens before
            // doing the measuring below, or it could be wrong.
            e.scrollCaretAfterNextScroll = true;
            return;
          }
        }
      }

      let domSelection;
      try {
        domSelection = ReactEditor.toDOMRange(e, {
          anchor: selection.focus,
          focus: selection.focus,
        });
      } catch (_err) {
        // harmless to just not do this in case of failure.
        return;
      }
      if (!domSelection) return;
      const selectionRect = domSelection.getBoundingClientRect();
      const editorEl = ReactEditor.toDOMNode(e, e);
      const editorRect = editorEl.getBoundingClientRect();
      const EXTRA = options?.middle
        ? editorRect.height / 2
        : editorRect.height > 100
        ? IS_FIREFOX
          ? 60
          : 20 // need more room on Firefox since we do custom cursor movement
        : // when using windowing, which doesn't work without enough space.
          0; // this much more than the min possible to get it on screen.

      let offset: number = 0;
      if (selectionRect.top < editorRect.top + EXTRA) {
        offset = editorRect.top + EXTRA - selectionRect.top;
      } else if (
        selectionRect.bottom - editorRect.top >
        editorRect.height - EXTRA
      ) {
        offset =
          editorRect.height - EXTRA - (selectionRect.bottom - editorRect.top);
      }
      if (offset) {
        if (windowed) {
          e.windowedListRef.current.list_ref?.current?.scrollTo(
            e.windowedListRef.current?.scroll_info.scrollOffset - offset
          );
        } else {
          editorEl.scrollTop = editorEl.scrollTop - offset;
        }
      }
    } catch (_e) {
      // The only side effect we are hiding is that the cursor might not
      // scroll into view, which is way better than crashing everything.
      // console.log("WARNING: failed to scroll cursor into view", e);
    }
  };

  return e;
};
