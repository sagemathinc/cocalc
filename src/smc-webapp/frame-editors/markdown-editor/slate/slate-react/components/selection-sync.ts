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
import { throttle } from "lodash";
import { ReactEditor } from "..";
import { IS_FOCUSED } from "../utils/weak-maps";
import { Transforms } from "slate";
import { hasEditableTarget, isTargetInsideVoid} from "./dom-utils";

export const useOnDOMSelectionChange = ({ editor, state, readOnly }) => {
  // Listen on the native `selectionchange` event to be able to update any time
  // the selection changes. This is required because React's `onSelect` is leaky
  // and non-standard so it doesn't fire until after a selection has been
  // released. This causes issues in situations where another change happens
  // while a selection is being dragged.
  const onDOMSelectionChange = useCallback(
    throttle(() => {
      if (!readOnly && !state.isComposing && !state.isUpdatingSelection) {
        const { activeElement } = window.document;
        const el = ReactEditor.toDOMNode(editor, editor);
        const domSelection = window.getSelection();

        if (activeElement === el) {
          state.latestElement = activeElement;
          IS_FOCUSED.set(editor, true);
        } else {
          IS_FOCUSED.delete(editor);
        }

        if (!domSelection) {
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
          Transforms.select(editor, range);
        } else {
          Transforms.deselect(editor);
        }
      }
    }, 100),
    [readOnly]
  );

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
