/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

function markdownReplace(editor: Editor): boolean {
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

export const withShortcuts = (editor) => {
  const { deleteBackward, insertText } = editor;

  editor.insertText = (text) => {
    const { selection } = editor;

    if (text === " " && selection && Range.isCollapsed(selection)) {
      if (markdownReplace(editor)) return;
    }
    insertText(text);
  };

  editor.deleteBackward = (...args) => {
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
