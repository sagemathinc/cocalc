/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// BUT note, this is derived initially from a slatejs example
// https://github.com/ianstormtaylor/slate/blob/master/site/examples/markdown-shortcuts.tsx

import {
  Editor,
  Transforms,
  Range,
  Point,
  Element as SlateElement,
  Text,
} from "slate";
import { markdown_to_slate } from "./markdown-to-slate";

import { applyOperations } from "./operations";

import {
  handleChangeTextNodes,
  isAllText,
} from "./slate-diff/handle-change-text-nodes";

/*
const SHORTCUTS = {
  $: { type: "math", value: "$x^2$", isVoid: true, isInline: true },
  $$: { type: "math", value: "$$x^3$$", isVoid: true, isInline: false },
  "*": { type: "list_item" },
  "-": { type: "list_item" },
  "+": { type: "list_item" },
  "1.": { type: "list_item" }, // need regexp...
  ">": { type: "blockquote" },
  "```": { type: "code_block", isVoid: true, fence: true, value: "", info: "" },
  "[ ]": { type: "checkbox", value: false, isInline: true, isVoid: true },
  "[x]": { type: "checkbox", value: true, isInline: true, isVoid: true },
  "#": { type: "heading", level: 1 },
  "##": { type: "heading", level: 2 },
  "###": { type: "heading", level: 3 },
  "####": { type: "heading", level: 4 },
  "#####": { type: "heading", level: 5 },
  "######": { type: "heading", level: 6 },
  "---": { type: "hr", isVoid: true },
};
*/

function markdownReplace(editor: Editor): boolean {
  const { selection } = editor;
  if (!selection) return false;
  const [node, path] = Editor.node(editor, selection.focus);
  if (!Text.isText(node)) return false;

  console.log("insertText", node);
  const slate = markdown_to_slate(node.text.trim());
  console.log("insertText --> ", slate);
  if (slate.length != 1) return false;
  const p = slate[0];
  if (Text.isText(p)) return false;

  if (!isAllText(p.children)) return false;
  if (p.children.length == 1 && p.children[0].text.trim() == node.text.trim()) {
    return false;
  }

  if (p.type == "paragraph") {
    if (isAllText(p.children)) {
      // paragraph and all text nodes -- can do it via our diff code.
      const nextNodes = p.children.concat([{ text: " " }]);
      const operations = handleChangeTextNodes([node], nextNodes, path, false);
      console.log({ nextNodes, operations });
      applyOperations(editor, operations);
      return true;
    }
  }

  return false;
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
