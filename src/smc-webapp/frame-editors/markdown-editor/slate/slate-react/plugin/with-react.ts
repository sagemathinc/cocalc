import * as ReactDOM from "react-dom";
import { Editor, Node, Path, Operation, Transforms, Range } from "slate";

import { ReactEditor } from "./react-editor";
import { Key } from "../utils/key";
import { EDITOR_TO_ON_CHANGE, NODE_TO_KEY } from "../utils/weak-maps";
import { isDOMText, getPlainText } from "../utils/dom";
import { findCurrentLineRange } from "../utils/lines";

/**
 * `withReact` adds React and DOM specific behaviors to the editor.
 */

export const withReact = <T extends Editor>(editor: T) => {
  const e = editor as T & ReactEditor;
  const { apply, onChange, deleteBackward } = e;

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
        // TODO
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

    const [start, end] = Range.edges(selection);
    const startVoid = Editor.void(e, { at: start.path });
    const endVoid = Editor.void(e, { at: end.path });

    if (Range.isCollapsed(selection) && !startVoid) {
      return;
    }

    // Create a fake selection so that we can add a Base64-encoded copy of the
    // fragment to the HTML, to decode on future pastes.
    const domRange = ReactEditor.toDOMRange(e, selection);
    let contents = domRange.cloneContents();
    let attach = contents.childNodes[0] as HTMLElement;

    // Make sure attach is non-empty, since empty nodes will not get copied.
    contents.childNodes.forEach((node) => {
      if (node.textContent && node.textContent.trim() !== "") {
        attach = node as HTMLElement;
      }
    });

    // COMPAT: If the end node is a void node, we need to move the end of the
    // range from the void node's spacer span, to the end of the void node's
    // content, since the spacer is before void's content in the DOM.
    if (endVoid) {
      const [voidNode] = endVoid;
      const r = domRange.cloneRange();
      const domNode = ReactEditor.toDOMNode(e, voidNode);
      r.setEndAfter(domNode);
      contents = r.cloneContents();
    }

    // COMPAT: If the start node is a void node, we need to attach the encoded
    // fragment to the void node's content node instead of the spacer, because
    // attaching it to empty `<div>/<span>` nodes will end up having it erased by
    // most browsers. (2018/04/27)
    if (startVoid) {
      attach = contents.querySelector("[data-slate-spacer]")! as HTMLElement;
    }

    // Remove any zero-width space spans from the cloned DOM so that they don't
    // show up elsewhere when pasted.
    Array.from(contents.querySelectorAll("[data-slate-zero-width]")).forEach(
      (zw) => {
        const isNewline = zw.getAttribute("data-slate-zero-width") === "n";
        zw.textContent = isNewline ? "\n" : "";
      }
    );

    // Set a `data-slate-fragment` attribute on a non-empty node, so it shows up
    // in the HTML, and can be used for intra-Slate pasting. If it's a text
    // node, wrap it in a `<span>` so we have something to set an attribute on.
    if (isDOMText(attach)) {
      const span = document.createElement("span");
      // COMPAT: In Chrome and Safari, if we don't add the `white-space` style
      // then leading and trailing spaces will be ignored. (2017/09/21)
      span.style.whiteSpace = "pre";
      span.appendChild(attach);
      contents.appendChild(span);
      attach = span;
    }

    const fragment = e.getFragment();
    const string = JSON.stringify(fragment);
    const encoded = window.btoa(encodeURIComponent(string));
    attach.setAttribute("data-slate-fragment", encoded);
    data.setData("application/x-slate-fragment", encoded);

    // Add the content to a <div> so that we can get its inner HTML.
    const div = document.createElement("div");
    div.appendChild(contents);
    div.setAttribute("hidden", "true");
    document.body.appendChild(div);
    data.setData("text/html", div.innerHTML);
    data.setData("text/plain", getPlainText(div));
    document.body.removeChild(div);
  };

  e.insertData = (data: DataTransfer) => {
    const fragment = data.getData("application/x-slate-fragment");

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

  e.scrollCaretIntoView = () => {
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
     had to rewrite it.

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
    requestAnimationFrame(() => {
      const { selection } = e;
      if (!selection) return;
      if (!Range.isCollapsed(selection)) return;

      // Important: there's no good way to do this when the focused
      // element is void, and the naive code leads to bad problems,
      // e.g., with several images, when you click on one things jump
      // around randomly and you sometimes can't scroll the image into view.
      // Better to just do nothing in case of voids.
      for (const [node] of Editor.nodes(e, { at: selection.focus })) {
        if (Editor.isVoid(e, node)) {
          return;
        }
      }
      const domSelection = ReactEditor.toDOMRange(e, selection);
      if (!domSelection) return;
      const selectionRect = domSelection.getBoundingClientRect();
      const editorEl = ReactEditor.toDOMNode(e, e);
      const editorRect = editorEl.getBoundingClientRect();
      if (selectionRect.top < editorRect.top) {
        editorEl.scrollTop =
          editorEl.scrollTop - (editorRect.top - selectionRect.top);
      } else if (selectionRect.bottom - editorRect.top > editorRect.height) {
        editorEl.scrollTop =
          editorEl.scrollTop -
          (editorRect.height - (selectionRect.bottom - editorRect.top));
      }
    });
  };

  return e;
};
