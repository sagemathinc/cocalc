/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

import { Editor, Operation, Transforms, Range, Path, Point, Text } from "slate";
import { len } from "@cocalc/util/misc";
import { markdown_to_slate } from "../markdown-to-slate";
import { applyOperations } from "../operations";
import { slateDiff } from "../slate-diff";
import { getRules } from "../elements";
import { ReactEditor } from "../slate-react";
import { SlateEditor } from "../editable-markdown";
import { formatHeading, setSelectionAndFocus } from "./commands";
const linkify = require("linkify-it")();

export const withInsertText = (editor) => {
  const { insertText: insertText0 } = editor;

  const insertText = (text) => {
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
  };

  editor.insertText = (text, autoFormat?) => {
    if (!text) return;
    if (linkify.test(text)) {
      // inserting a link somehow, e.g., by pasting.  Instead,
      // create a link node instead of plain text.
      Transforms.insertNodes(editor, [
        {
          type: "link",
          isInline: true,
          url: text,
          children: [{ text }],
        },
      ]);
      return;
    }
    if (!autoFormat) {
      insertText(text);
      return;
    }
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      if (text === " ") {
        insertText(text);
        markdownAutoformat(editor);
        return;
      }
    }

    insertText(text);
  };

  return editor;
};

// Use conversion back and forth to markdown to autoformat
// what is right before the cursor in the current text node.
function markdownAutoformat(editor: SlateEditor): boolean {
  const { selection } = editor;
  if (!selection) return false;
  const [node] = Editor.node(editor, selection.focus.path);
  // Must be a text node
  if (!Text.isText(node)) return false;

  let r: boolean | Function = false;
  try {
    Editor.withoutNormalizing(editor, () => {
      editor.apply({
        type: "split_node",
        path: selection.focus.path,
        position: selection.focus.offset - 1,
        properties: node, // important to preserve text properties on split (seems fine to leave text field)
      });
      r = markdownAutoformatAt(editor, selection.focus.path);
    });
  } catch (err) {
    console.warn(`SLATE -- issue in markdownAutoformat ${err}`);
  }

  if (typeof r == "function") {
    // code to run after normalizing.
    // @ts-ignore
    r();
    r = true;
  }
  return r;
}

// Use conversion back and forth to markdown to autoformat
// what is in the current text node.
function markdownAutoformatAt(
  editor: SlateEditor,
  path: Path
): boolean | Function {
  const [node] = Editor.node(editor, path);
  // Must be a text node
  if (!Text.isText(node)) return false;
  const pos = path[path.length - 1]; // position among siblings.

  // Find the first whitespace from the end after triming whitespace.
  // This is what we autoformat on, since it is the most predictable,
  // and doesn't suddenly do something with text earlier in the node
  // that the user already explicitly decided not to autoformat.
  let text = node.text;
  let start = text.lastIndexOf(" ", text.trimRight().length - 1);

  // Special case some block level formatting (for better handling and speed).
  if (path.length == 2 && pos == 0 && start <= 0) {
    switch (text) {
      case "#":
      case "##":
      case "###":
      case "####":
      case "#####":
      case "######":
        // This could sets the block containing the selection
        // to be formatted with exactly the right heading.
        formatHeading(editor, text.length);
        // However, because we just typed some hashes to get this
        // to happen, we need to delete them.  But this has to wait
        // until after normalize, and this whole function is run
        // in a withoutNormalizing block, so we return some code to
        // run afterwards.
        return () => editor.deleteBackward("word");
    }
  }

  // However, there are some cases where we extend the range of
  // the autofocus further to the left from start:
  //    - "[ ]" for checkboxes.
  //    - formatting, e.g., "consider `foo bar`".
  //    - NOTE: I'm not allowing for space in  math formulas ($ or $$) here,
  //      since it is very annoying if you trying to type USD amounts. A
  //      workaround is create the inline formula with no spaces, then edit it.
  const text0 = text.trimRight();
  if (text0.endsWith("]")) {
    const i = text.lastIndexOf("[");
    if (i != -1) {
      start = Math.min(i - 1, start);
    }
  } else {
    // The text formatting markers and *also* math formatting.
    // Note that $$ is first since $ would match it.
    for (const delim of ["`", "**", "*", "_", "~~", "$$", "$"]) {
      if (text0.endsWith(delim)) {
        const i = text.lastIndexOf(delim, text0.length - delim.length - 1);
        if (i != -1) {
          start = Math.min(i - 1, start);
          break;
        }
      }
    }
  }

  text = text.slice(start + 1).trim();
  if (text.length == 0) return false;

  // make a copy to avoid any caching issues (??).
  const doc = [...(markdown_to_slate(text, true) as any)];
  // console.log(`autoformat '${text}' = \n`, JSON.stringify(doc, undefined, 2));

  if (
    doc.length == 1 &&
    doc[0].type == "paragraph" &&
    doc[0].children.length == 1 &&
    Text.isText(doc[0].children[0]) &&
    doc[0].children[0].text.trim() == text.trim()
  ) {
    // No "auto format" action since no real change.
    return false;
  }

  const isInline =
    doc.length == 1 &&
    doc[0].type == "paragraph" &&
    Text.isText(doc[0].children[0]);

  if (!isInline) {
    if (start > 0 || pos > 0) {
      return false;
    }
  }

  // **INLINE CASE**
  if (isInline) {
    const children = doc[0].children;
    if (start != -1) {
      if (children[0]["text"] === "") {
        // In case the first node in children is empty text, remove that,
        // since otherwise it will get normalized away after doing this,
        // and that throws the cursor computation off below, causing a crash.
        children.shift();
      }
      // Add text from before starting point back, since we excluded it above.
      const first = { ...node };
      first.text = node.text.slice(0, start + 1);
      children.unshift(first);
    }
    // Add a space at the end.
    if (
      len(children[children.length - 1]) == 1 &&
      children[children.length - 1]["text"] != null
    ) {
      // text node with NO marks, i.e., it is plain text.
      children[children.length - 1]["text"] += " ";
    } else {
      // last node has marks so we append another node.
      children.push({ text: " " });
    }

    // Find a sequence of operations that converts our input
    // text node into the new list of inline nodes.
    const operations = slateDiff(
      [node],
      children,
      path.slice(0, path.length - 1)
    );

    // Adjust the last entry in path for each operation computed
    // above to account for fact that node might not be first sibling.
    for (const op of operations) {
      shift_path(op, pos);
    }

    applyOperations(editor, operations);
    // Move the cursor to the right position.
    const new_path = [...path];
    new_path[new_path.length - 1] += children.length - 1;
    const new_cursor = {
      offset: children[children.length - 1]["text"].length,
      path: new_path,
    };
    focusEditorAt(editor, new_cursor);
  } else {
    // **NON-INLINE CASE**
    // Remove the node with the text that we're autoformatting
    // so the new doc replaces it.  NOTE that doing this works
    // **much** better than selecting the corresponding text
    // and letting insertNodes take care of it.
    Transforms.removeNodes(editor, { at: path });
    // We put an empty paragraph after, so that formatting
    // is preserved (otherwise it gets stripped); also some documents
    // ending in void block elements are difficult to use.
    Transforms.insertNodes(editor, doc);

    // Normally just move the cursor beyond what was just
    // inserted, though sometimes it makes more sense to
    // focus it.
    const type = doc[0].type;
    const rules = getRules(type);
    if (!rules?.autoFocus) {
      // move cursor out of the newly created block element.
      Transforms.move(editor, { distance: 1 });
    }
  }
  return true;
}

function shift_path(op: Operation, shift: number): void {
  const path = [...op["path"]];
  path[path.length - 1] += shift;
  op["path"] = path;
}

// This is pretty scary, but I need it especially in the weird case
// where you insert a checkbox in an empty document and everything
// loses focus.
// This is a SCARY function..
export function focusEditorAt(editor: ReactEditor, point: Point): void {
  setSelectionAndFocus(editor, { focus: point, anchor: point });
}
