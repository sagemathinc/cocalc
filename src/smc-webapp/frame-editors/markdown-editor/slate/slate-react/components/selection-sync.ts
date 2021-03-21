/*
Syncing the selection between slate and the DOM.

This started by factoring out the relevant code from editable.tsx.
We then rewrote it to work with react-window, which of course discards
the DOM outside the visible window, hence full sync no longer makes
sense -- instead the slate selection is the sole source of truth, and
the DOM just partly reflects that, and user manipulation of the DOM
merely influences slates state, rather than completely determining it.
*/

import { useCallback } from "react";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";
import { ReactEditor } from "..";
import { EDITOR_TO_ELEMENT, IS_FOCUSED } from "../utils/weak-maps";
import { Point, Range, Selection, Transforms } from "slate";
import { hasEditableTarget, isTargetInsideVoid } from "./dom-utils";

export const useUpdateDOMSelection = ({ editor, state }) => {
  // Ensure that the DOM selection state is set to the editor selection.
  // Note that whenever the DOM gets updated (e.g., with every keystroke when editing)
  // the DOM selection gets completely reset (because react replaces the selected text
  // by new text), so this setting of the selection usually happens, and happens
  // **a lot**.
  const updateDOMSelection = () => {
    if (state.isComposing || !ReactEditor.isFocused(editor)) {
      // console.log("useUpdateDOMSelection: early return");
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection) {
      return;
    }

    const selection = getWindowedSelection(editor);
    const hasDomSelection = domSelection.type !== "None";

    // If the DOM selection is properly unset, we're done.
    if (!selection && !hasDomSelection) {
      // console.log("useUpdateDOMSelection: no selection");
      return;
    }

    // verify that the DOM selection is in the editor
    const editorElement = EDITOR_TO_ELEMENT.get(editor)!;
    let hasDomSelectionInEditor = false;
    if (
      editorElement.contains(domSelection.anchorNode) &&
      editorElement.contains(domSelection.focusNode)
    ) {
      hasDomSelectionInEditor = true;
    }

    if (!selection) {
      // need to clear selection
      if (hasDomSelectionInEditor) {
        // the current nontrivial selection is inside the editor,
        // so we just clear it.
        domSelection.removeAllRanges();
      }
      // Not sure what to do here.
      return;
    }
    let newDomRange;
    try {
      newDomRange = ReactEditor.toDOMRange(editor, selection);
    } catch (err) {
      // This error happens e.g., if you set the selection to a point that isn't valid
      // in the document.  TODO: Our autoformat code annoyingly does this sometimes.
      return;
    }
    // Compare the new DOM range we want, to what's actually selected.  If they are
    // the same, done.  If different, we change the selection in the DOM.
    if (Range.isBackward(selection)) {
      newDomRange = {
        endContainer: newDomRange.startContainer,
        endOffset: newDomRange.startOffset,
        startContainer: newDomRange.endContainer,
        startOffset: newDomRange.endOffset,
      };
    }

    if (
      domSelection.anchorNode?.isEqualNode(newDomRange.startContainer) &&
      domSelection.focusNode?.isEqualNode(newDomRange.endContainer) &&
      domSelection.anchorOffset === newDomRange.startOffset &&
      domSelection.focusOffset === newDomRange.endOffset
    ) {
      // It's correct already.
      // console.log("useUpdateDOMSelection: selection already correct");
      return;
    }

    // Acutally make the change.
    /* console.log(
      "useUpdateDOMSelection: changing newDomRange",
      newDomRange,
      "  was",
      { node: domSelection.focusNode, offset: domSelection.focusOffset }
    );*/
    domSelection.setBaseAndExtent(
      newDomRange.startContainer,
      newDomRange.startOffset,
      newDomRange.endContainer,
      newDomRange.endOffset
    );
  };

  // Always update DOM when editor updates.
  useIsomorphicLayoutEffect(updateDOMSelection);

  // We also return this so it can be called on scroll, which is needed
  // for windowing.
  return updateDOMSelection;
};

export const useDOMSelectionChange = ({ editor, state, readOnly }) => {
  // Listen on the native `selectionchange` event to be able to update any time
  // the selection changes. This is required because React's `onSelect` is leaky
  // and non-standard so it doesn't fire until after a selection has been
  // released. This causes issues in situations where another change happens
  // while a selection is being dragged.

  const onMouseUp = useCallback(() => {
    state.selection.mousedown = false;
  }, []);
  const onMouseDown = useCallback(() => {
    state.selection.mousedown = true;
  }, []);
  const onKeyUp = useCallback((event) => {
    if (event.key == "Shift") {
      state.selection.shiftdown = false;
    }
  }, []);
  const onKeyDown = useCallback((event) => {
    if (event.key == "Shift") {
      state.selection.shiftdown = true;
    }
  }, []);

  const onDOMSelectionChange = useCallback(() => {
    // console.log("onDOMSelectionChange", state.selection.mousedown);
    if (readOnly || state.isComposing) {
      return;
    }
    if (!state.selection.mousedown && !state.selection.shiftdown) return;
    const { activeElement } = window.document;
    const el = ReactEditor.toDOMNode(editor, editor);
    const domSelection = window.getSelection();
    // console.log("onDOMSelectionChange", { activeElement, el, domSelection });

    if (activeElement === el) {
      state.latestElement = activeElement;
      IS_FOCUSED.set(editor, true);
    } else {
      IS_FOCUSED.delete(editor);
    }

    if (!domSelection) {
      // console.log("onDOMSelectionChange - no selection so deselect");
      Transforms.deselect(editor);
      return;
    }

    const { anchorNode, focusNode, isCollapsed } = domSelection;

    const anchorNodeSelectable =
      hasEditableTarget(editor, anchorNode) ||
      isTargetInsideVoid(editor, anchorNode);

    const focusNodeSelectable =
      hasEditableTarget(editor, focusNode) ||
      isTargetInsideVoid(editor, focusNode);

    if (anchorNodeSelectable && focusNodeSelectable) {
      const range = ReactEditor.toSlateRange(editor, domSelection);
      const { selection } = editor;
      // console.log("onDOMSelectionChange -- select", { domSelection, range });
      if (
        editor.windowedListRef?.current != null &&
        !isCollapsed &&
        selection != null
      ) {
        // Trickier case: non-collapsed and using windowing and selection
        // is not already null.   We just preserve the internal slate anchor
        // in this case.  This works because the only time you move the anchor
        // is when you're starting a new selection, which starts out not
        // collapsed.
        range.anchor = selection.anchor;
      }

      if (selection == null || !Range.equals(selection, range)) {
        Transforms.select(editor, range);
      }
    } else {
      // console.log("onDOMSelectionChange -- deselect");
      Transforms.deselect(editor);
    }
  }, [readOnly]);

  // Attach a native DOM event handler for `selectionchange`, because React's
  // built-in `onSelect` handler doesn't fire for all selection changes. It's a
  // leaky polyfill that only fires on keypresses or clicks. Instead, we want to
  // fire for any change to the selection inside the editor. (2019/11/04)
  // https://github.com/facebook/react/issues/5785
  useIsomorphicLayoutEffect(() => {
    window.document.addEventListener("selectionchange", onDOMSelectionChange);
    window.document.addEventListener("mousedown", onMouseDown);
    window.document.addEventListener("mouseup", onMouseUp);
    window.document.addEventListener("keydown", onKeyDown);
    window.document.addEventListener("keyup", onKeyUp);
    return () => {
      window.document.removeEventListener(
        "selectionchange",
        onDOMSelectionChange
      );
      window.document.removeEventListener("mousedown", onMouseDown);
      window.document.removeEventListener("mouseup", onMouseUp);
      window.document.removeEventListener("keydown", onKeyDown);
      window.document.removeEventListener("keyup", onKeyUp);
    };
  }, [onDOMSelectionChange]);
};

export function getWindowedSelection(editor: ReactEditor): Selection | null {
  const { selection } = editor;
  if (
    selection == null ||
    editor.windowedListRef?.current == null ||
    Range.isCollapsed(selection)
  ) {
    // No selection, or not using windowing, or collapsed so easy.
    return selection;
  }

  // Now we trim non-collapsed selection to part of window in the DOM.
  const info = editor.windowedListRef.current.render_info;
  if (info == null) return selection;
  // console.log(JSON.stringify({selection,info,}));
  const { anchor, focus } = selection;
  return { anchor: clipPoint(anchor, info), focus: clipPoint(focus, info) };
}

function clipPoint(point: Point, info): Point {
  const { overscanStartIndex, overscanStopIndex } = info;
  const n = point.path[0];
  if (n < overscanStartIndex) {
    return { path: [overscanStartIndex], offset: 0 };
  }
  if (n > overscanStopIndex) {
    return { path: [overscanStopIndex], offset: 0 };
  }
  return point;
}
