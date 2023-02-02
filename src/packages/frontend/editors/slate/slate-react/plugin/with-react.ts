import ReactDOM from "react-dom";
import {
  Editor,
  Element,
  Descendant,
  Path,
  Operation,
  Transforms,
  Range,
} from "slate";

import { ReactEditor } from "./react-editor";
import { Key } from "../utils/key";
import { EDITOR_TO_ON_CHANGE, NODE_TO_KEY } from "../utils/weak-maps";
import { findCurrentLineRange } from "../utils/lines";

/**
 * `withReact` adds React and DOM specific behaviors to the editor.
 */

export const withReact = <T extends Editor>(editor: T) => {
  const e = editor as T & ReactEditor;
  const { apply, onChange, deleteBackward } = e;

  e.windowedListRef = { current: null };

  e.collapsedSections = new WeakMap();

  e.deleteBackward = (unit) => {
    if (unit !== "line") {
      return deleteBackward(unit);
    }

    if (editor.selection && Range.isCollapsed(editor.selection)) {
      const parentBlockEntry = Editor.above(editor, {
        match: (node) =>
          Element.isElement(node) && Editor.isBlock(editor, node),
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
    const plain = (e as any).getPlainValue?.(fragment);
    if (plain == null) {
      throw Error("copy not implemented");
    }
    const encoded = window.btoa(encodeURIComponent(JSON.stringify(fragment)));

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

    // TODO: we want to do this, but it currently causes a slight
    // delay, which is very disconcerting.  We need some sort of
    // local slate undo before saving out to markdown (which has
    // to wait until there is a pause in typing).
    //(e as any).saveValue?.(true);

    if (fragment) {
      const decoded = decodeURIComponent(window.atob(fragment));
      const parsed = JSON.parse(decoded) as Descendant[];
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

  // only when windowing is enabled.
  e.scrollIntoDOM = (index) => {
    let windowed: boolean = e.windowedListRef.current != null;
    if (windowed) {
      const visibleRange = e.windowedListRef.current?.visibleRange;
      if (visibleRange != null) {
        const { startIndex, endIndex } = visibleRange;
        if (index < startIndex || index > endIndex) {
          const virtuoso = e.windowedListRef.current.virtuosoRef?.current;
          if (virtuoso != null) {
            virtuoso.scrollIntoView({ index });
            return true;
          }
        }
      }
    }
    return false;
  };

  e.scrollCaretIntoView = (options?: { middle?: boolean }) => {
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
      if (selection == null) return;

      // Important: this doesn't really work well for many types
      // of void elements, e.g, when the focused
      // element is an image -- with several images, when
      // you click on one, things jump
      // around randomly and you sometimes can't scroll the image into view.
      // Better to just do nothing in this case.
      for (const [node] of Editor.nodes(e, { at: selection.focus })) {
        if (
          Element.isElement(node) &&
          Editor.isVoid(e, node) &&
          !SCROLL_WHITELIST.has(node["type"])
        ) {
          return;
        }
      }

      // In case we're using windowing, scroll the block with the focus
      // into the DOM first.
      let windowed: boolean = e.windowedListRef.current != null;
      if (windowed && !e.scrollCaretAfterNextScroll) {
        const index = selection.focus.path[0];
        const visibleRange = e.windowedListRef.current?.visibleRange;
        if (visibleRange != null) {
          const { startIndex, endIndex } = visibleRange;
          if (index < startIndex || index > endIndex) {
            // We need to scroll the block containing the cursor into the DOM first?
            e.scrollIntoDOM(index);
            // now wait until the actual scroll happens before
            // doing the measuring below, or it could be wrong.
            e.scrollCaretAfterNextScroll = true;
            requestAnimationFrame(() => e.scrollCaretIntoView());
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
        ? 20
        : 0; // this much more than the min possible to get it on screen.

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
          const scroller = e.windowedListRef.current?.getScrollerRef();
          if (scroller != null) {
            scroller.scrollTop = scroller.scrollTop - offset;
          }
        } else {
          editorEl.scrollTop = editorEl.scrollTop - offset;
        }
      }
    } catch (_err) {
      // console.log("WARNING: scrollCaretIntoView -- ", err);
      // The only side effect we are hiding is that the cursor might not
      // scroll into view, which is way better than crashing everything.
      // console.log("WARNING: failed to scroll cursor into view", e);
    }
  };

  return e;
};

const SCROLL_WHITELIST = new Set(["hashtag", "checkbox"]);
