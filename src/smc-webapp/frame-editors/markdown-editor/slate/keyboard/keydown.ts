/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Formatting (etc.) triggered via the keyboard in various ways.

*/

import { Editor } from "slate";
import { formatText } from "../format/format-text";
import { indentListItem, unindentListItem } from "../format/indent";
import { toggleCheckbox } from "../elements/checkbox";
import { selectAll } from "../format/misc";
import { IS_MACOS } from "smc-webapp/feature";
import { moveCursorUp, moveCursorDown } from "../control";
import { enterKey } from "./enter";
import { backspaceKey } from "./backspace";

export function keyDownHandler(editor, e): boolean {
  // console.log("onKeyDown", { keyCode: e.keyCode, key: e.key });
  const unmodified = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

  if (formatText(editor, e)) {
    // control+b, etc. to format selected text.
    return true;
  }

  if (e.key == "Backspace" || e.key == "Delete") {
    // Special case -- deleting (certain?) void elements. See
    //   https://github.com/ianstormtaylor/slate/issues/3875
    // for discussion of why we must implement this ourselves.
    return backspaceKey(editor);
  }

  // Select all
  if (e.key == "a" && ((IS_MACOS && e.metaKey) || (!IS_MACOS && e.ctrlKey))) {
    // On Firefox with windowing enabled,
    // doing browser select all selects too much (e.g., the
    // react-windowed list), and this causes crashes.  Note that this
    // selectAll here only partly addresses the problem with windowing
    // and large documents where select all fails (due to missing DOM
    // nodes not in the window).  The select now happens but other
    // things break.
    selectAll(editor);
    return true;
  }

  if (e.key == " ") {
    if (unmodified && toggleCheckbox(editor)) {
      // we toggled a selected textbox. Done.
      return true;
    }

    // @ts-ignore - that second argument below is "unsanctioned"
    editor.insertText(" ", unmodified);
    return true;
  }

  if (e.key == "Tab") {
    if (e.shiftKey) {
      if (unindentListItem(editor)) {
        return true;
      }
      // for now... but maybe remove it later
      editor.insertText("    ");
      return true;
    } else {
      if (indentListItem(editor)) {
        return true;
      }

      // Markdown doesn't have a notion of tabs in text, so
      // putting in four spaces for now, but is this optimal?
      editor.insertText("    ");
      return true;
    }
  }

  if (e.key == "Enter") {
    return enterKey(editor, e, unmodified);
  }

  if (unmodified) {
    if (e.key == "ArrowDown") {
      if (!Editor.isVoid(editor, editor.getFragment()[0])) {
        return false;
      }
      moveCursorDown(editor, true);
      return true;
    }

    if (e.key == "ArrowUp") {
      if (!Editor.isVoid(editor, editor.getFragment()[0])) {
        return false;
      }
      moveCursorUp(editor, true);
      return true;
    }

    if (e.key == "Tab") {
      if (indentListItem(editor)) {
        return true;
      }

      // Markdown doesn't have a notion of tabs in text...
      // Putting in four spaces for now, but we'll probably change this...
      editor.insertText("    ");
      return true;
    }
  }
  return false;
}
