/* Some utility functions factored out of editable.tsx */

import { ReactEditor } from "..";
import { Editor } from "slate";

import { DOMNode, isDOMNode } from "../utils/dom";

/**
 * Check if the target is inside void and in the editor.
 */

export const isTargetInsideVoid = (
  editor: ReactEditor,
  target: EventTarget | null
): boolean => {
  const slateNode =
    hasTarget(editor, target) && ReactEditor.toSlateNode(editor, target);
  return Editor.isVoid(editor, slateNode);
};

/**
 * Check if the target is editable and in the editor.
 */

export const hasEditableTarget = (
  editor: ReactEditor,
  target: EventTarget | null
): target is DOMNode => {
  return (
    isDOMNode(target) &&
    ReactEditor.hasDOMNode(editor, target, { editable: true })
  );
};

/**
 * Check if the target is in the editor.
 */

export const hasTarget = (
  editor: ReactEditor,
  target: EventTarget | null
): target is DOMNode => {
  return isDOMNode(target) && ReactEditor.hasDOMNode(editor, target);
};
