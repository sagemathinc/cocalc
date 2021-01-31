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

import {
  Editor,
  Operation,
  Transforms,
  Range,
  Point,
  Element as SlateElement,
  Text,
} from "slate";
import { markdown_to_slate } from "./markdown-to-slate";

import { applyOperations } from "./operations";
import { slateDiff } from "./slate-diff";
import { len } from "smc-util/misc";

async function markdownReplace(editor: Editor): Promise<boolean> {
  const { selection } = editor;
  if (!selection) return false;
  const [node, path] = Editor.node(editor, selection.focus);
  if (!Text.isText(node)) return false;
  const pos = path[path.length - 1]; // position among siblings.

  const slate = markdown_to_slate(node.text.trim());
  if (slate.length != 1) return false;
  const p = slate[0];
  if (Text.isText(p)) return false;

  if (
    p.type == "paragraph" &&
    p.children.length == 1 &&
    Text.isText(p.children[0]) &&
    p.children[0].text.trim() == node.text.trim()
  ) {
    // No "auto format" action.
    return false;
  }

  // Do an immediate save so that it is easy and possible
  // to undo exactly the result of auto format, in case user
  // doesn't like it.
  // @ts-ignore
  editor.saveValue();
  // Wait for next time to finish before applying operations below; if
  // we don't do this, then things get all messed up.
  await delay(0);

  // First the inline case:
  if (p.type == "paragraph" && Text.isText(p.children[0])) {
    // Add whitespace to the beginning of the first node.
    for (let i = 0; i < node.text.length; i++) {
      if (node.text[i] == " ") {
        p.children[0].text = " " + p.children[0].text;
      } else {
        break;
      }
    }
    // And one space at the end.
    if (len(p.children[p.children.length - 1]) == 1) {
      p.children[p.children.length - 1]["text"] += " ";
    } else {
      p.children.push({ text: " " });
    }

    // Find a sequence of operations that converts our input
    // text node into the new list of inline nodes.
    const operations = slateDiff(
      [node],
      p.children,
      path.slice(0, path.length - 1)
    );

    // Adjust the last entry in path to account for fact that
    // node might not be first sibling.
    for (const op of operations) {
      shift_path(op, pos);
    }
    applyOperations(editor, operations);

    // Move the cursor to be after all our new nodes.
    const new_path = [...path];
    new_path[new_path.length - 1] += p.children.length - 1;
    const new_cursor = {
      offset: p.children[p.children.length - 1]["text"].length,
      path: new_path,
    };
    Transforms.setSelection(editor, { focus: new_cursor, anchor: new_cursor });

    return true;
  }

  // Next the non-inline case.
  // Split the node at the beginning of the text leaf
  // that we are replacing.
  Transforms.splitNodes(editor, { at: { path, offset: 0 } });
  Transforms.removeNodes(editor);
  Transforms.insertNodes(editor, [
    p,
    { type: "paragraph", children: [{ text: "" }] },
  ]);
  if (p.type == "hr") {
    Transforms.move(editor, { distance: 1 });
  }
  return true;
}

export const withAutoFormat = (editor) => {
  const { deleteBackward, insertText } = editor;

  editor.insertText = async (text, noFormat?) => {
    if (noFormat) {
      insertText(text);
      return;
    }
    const { selection } = editor;

    if (text === " " && selection && Range.isCollapsed(selection)) {
      insertText(text);
      // This is fundamentally different than
      // https://www.slatejs.org/examples/markdown-shortcuts
      if (await markdownReplace(editor)) return;
    }
    insertText(text);
  };

  editor.deleteBackward = (...args) => {
    // This code is pretty much exactly like
    // https://www.slatejs.org/examples/markdown-shortcuts
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const match = Editor.above(editor, {
        match: (n) => Editor.isBlock(editor, n),
      });

      if (match) {
        const [block, path] = match;
        const start = Editor.start(editor, path);

        if (
          !Editor.isEditor(block) &&
          SlateElement.isElement(block) &&
          block.type !== "paragraph" &&
          Point.equals(selection.anchor, start)
        ) {
          const newProperties: Partial<SlateElement> = {
            type: "paragraph",
          };
          Transforms.setNodes(editor, newProperties);

          if (block.type === "list_item") {
            Transforms.unwrapNodes(editor, {
              match: (n) =>
                !Editor.isEditor(n) &&
                SlateElement.isElement(n) &&
                n.type === "bullet_list",
              split: true,
            });
          }

          return;
        }
      }

      deleteBackward(...args);
    }
  };

  return editor;
};

function shift_path(op: Operation, shift: number): void {
  const path = [...op["path"]];
  path[path.length - 1] += shift;
  op["path"] = path;
}
