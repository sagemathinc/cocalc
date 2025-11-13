/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Automatic formatting

The idea is you type some markdown in a text cell, then space, and
if the markdown processor does something nontrivial given that text,
then the text gets replaced by the result.

The actual implementation of this is **much deeper** than what is done
in the "shortcuts" slatejs demo here

    https://www.slatejs.org/examples/markdown-shortcuts

in two ways:

1. This automatically supports everything the markdown-to-slate
implementation supports.  Instead of having to reimplement bits
and pieces of markdown that we think of, we automatically get
absolutely everything the processor supports with 100% correct
results.  If at any point we ever add a new plugin to markdown-it,
or change options, they just automatically work.

2. We use our slate-diff implementation to make the transformation
rather than coding it up for different special cases.  This slate-diff
is itself  deep, being based on diff-match-patch, and using numerous
heuristics.
*/

import { Transforms, Range } from "slate";
import { markdownAutoformat } from "./auto-format";

export const withInsertText = (editor) => {
  const { insertText: insertText0 } = editor;

  const insertText = (text) => {
    try {
      if (editor.marks) {
        // This case is to work around a strange bug that I don't know how to fix.
        // If you type in a blank document:
        //   command+b then "foo"
        // you will see "oof" in bold.  This happens in many other situations, where
        // initially when you insert a character in a blank paragraph with a mark, the
        // cursor doesn't move.  I don't know why.  We thus check after inserting
        // text that the focus moves, and if not, we move it.
        const { selection } = editor;
        insertText0(text);
        if (
          editor.selection != null &&
          editor.selection.focus.offset == selection?.focus.offset
        ) {
          Transforms.move(editor, { distance: 1 });
        }
      } else {
        insertText0(text);
      }
    } catch (err) {
      // I once saw trying to insert text when some state is invalid causing
      // a crash in production to me.  It's better for the text to not get
      // inserted and get a console warning, than for everything to crash
      // in your face, hence this.
      console.warn(`WARNING -- problem inserting text "${text}" -- ${err}`);
    }
  };

  editor.insertText = (text, autoFormat?) => {
    if (!text) return;
    if (!autoFormat) {
      insertText(text);
      return;
    }
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      if (text === " ") {
        if (!markdownAutoformat(editor)) {
          insertText(text);
        }
        return;
      }
    }

    insertText(text);
  };

  return editor;
};
