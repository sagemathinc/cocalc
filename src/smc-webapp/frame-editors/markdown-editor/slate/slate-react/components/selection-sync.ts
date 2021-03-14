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
import { Range, Transforms } from "slate";
import { hasEditableTarget, isTargetInsideVoid } from "./dom-utils";
import { IS_FIREFOX } from "../utils/environment";

export const useUpdateDOMSelection = ({ editor, state }) => {
  // Make sure the DOM selection
  // state is set to the editor selection.
  const updateDOMSelection = () => {
    // console.log("useUpdateDOMSelection");
    const { selection } = editor;
    const domSelection = window.getSelection();

    if (state.isComposing || !domSelection || !ReactEditor.isFocused(editor)) {
      // console.log("useUpdateDOMSelection: early return");
      return;
    }

    const hasDomSelection = domSelection.type !== "None";

    // If the DOM selection is properly unset, we're done.
    if (!selection && !hasDomSelection) {
      // console.log("useUpdateDOMSelection: no selection");
      return;
    }

    // verify that the dom selection is in the editor
    const editorElement = EDITOR_TO_ELEMENT.get(editor)!;
    let hasDomSelectionInEditor = false;
    if (
      editorElement.contains(domSelection.anchorNode) &&
      editorElement.contains(domSelection.focusNode)
    ) {
      hasDomSelectionInEditor = true;
    }

    // If the DOM selection is in the editor and the editor selection is already correct, we're done.
    if (
      hasDomSelection &&
      hasDomSelectionInEditor &&
      selection &&
      Range.equals(ReactEditor.toSlateRange(editor, domSelection), selection)
    ) {
      // console.log("useUpdateDOMSelection: already correct");
      return;
    }

    // Otherwise the DOM selection is out of sync, so update it.
    state.isUpdatingSelection = true;

    let newDomRange;
    try {
      newDomRange = selection && ReactEditor.toDOMRange(editor, selection);
    } catch (err) {
      // console.log("TODO: toDOMRange when selection is not visible.", err);
      newDomRange = undefined;
    }

    if (newDomRange) {
      // console.log("useUpdateDOMSelection: setting newDomRange", newDomRange);
      if (Range.isBackward(selection!)) {
        domSelection.setBaseAndExtent(
          newDomRange.endContainer,
          newDomRange.endOffset,
          newDomRange.startContainer,
          newDomRange.startOffset
        );
      } else {
        domSelection.setBaseAndExtent(
          newDomRange.startContainer,
          newDomRange.startOffset,
          newDomRange.endContainer,
          newDomRange.endOffset
        );
      }
    } else {
      // console.log("useUpdateDOMSelection: removeAllRanges");
      domSelection.removeAllRanges();
    }

    setTimeout(() => {
      // COMPAT: In Firefox, it's not enough to create a range, you also need
      // to focus the contenteditable element too. (2016/11/16)
      if (newDomRange && IS_FIREFOX) {
        try {
          const el = ReactEditor.toDOMNode(editor, editor);
          el.focus();
        } catch (err) {
          console.log("WARNING: failed to find DOMNode to focus on firefox");
        }
      }

      state.isUpdatingSelection = false;
    });
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
  const onDOMSelectionChange = useCallback(() => {
    if (!readOnly && !state.isComposing && !state.isUpdatingSelection) {
      const { activeElement } = window.document;
      const el = ReactEditor.toDOMNode(editor, editor);
      const domSelection = window.getSelection();
      //console.log("onDOMSelectionChange", { activeElement, el, domSelection });

      if (activeElement === el) {
        state.latestElement = activeElement;
        IS_FOCUSED.set(editor, true);
      } else {
        IS_FOCUSED.delete(editor);
      }

      if (!domSelection) {
        //console.log("onDOMSelectionChange - no selection so deselect");
        return Transforms.deselect(editor);
      }

      const { anchorNode, focusNode } = domSelection;

      const anchorNodeSelectable =
        hasEditableTarget(editor, anchorNode) ||
        isTargetInsideVoid(editor, anchorNode);

      const focusNodeSelectable =
        hasEditableTarget(editor, focusNode) ||
        isTargetInsideVoid(editor, focusNode);

      if (anchorNodeSelectable && focusNodeSelectable) {
        const range = ReactEditor.toSlateRange(editor, domSelection);
        //console.log("onDOMSelectionChange -- select", { domSelection, range });
        Transforms.select(editor, range);
      } else {
        //console.log("onDOMSelectionChange -- deselect");
        Transforms.deselect(editor);
      }
    }
  }, [readOnly]);

  // Attach a native DOM event handler for `selectionchange`, because React's
  // built-in `onSelect` handler doesn't fire for all selection changes. It's a
  // leaky polyfill that only fires on keypresses or clicks. Instead, we want to
  // fire for any change to the selection inside the editor. (2019/11/04)
  // https://github.com/facebook/react/issues/5785
  useIsomorphicLayoutEffect(() => {
    window.document.addEventListener("selectionchange", onDOMSelectionChange);

    return () => {
      window.document.removeEventListener(
        "selectionchange",
        onDOMSelectionChange
      );
    };
  }, [onDOMSelectionChange]);
};
