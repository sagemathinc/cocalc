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
} from "slate";

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

export const withShortcuts = (editor) => {
  const { deleteBackward, insertText } = editor;

  editor.insertText = (text) => {
    const { selection } = editor;

    if (text === " " && selection && Range.isCollapsed(selection)) {
      const { anchor } = selection;
      const block = Editor.above(editor, {
        match: (n) => Editor.isBlock(editor, n),
      });
      const path = block ? block[1] : [];
      const start = Editor.start(editor, path);
      const range = { anchor, focus: start };
      const beforeText = Editor.string(editor, range);
      let shortcut: Partial<SlateElement> = SHORTCUTS[beforeText];

      if (shortcut != null) {
        Transforms.select(editor, range);
        Transforms.delete(editor);
        if (editor.isInline(shortcut)) {
          Transforms.wrapNodes(editor, shortcut as any);
        } else {
          Transforms.setNodes(editor, shortcut, {
            match: (n) => Editor.isBlock(editor, n),
          });
        }

        if (shortcut.type === "list_item") {
          let list;
          if (beforeText == "1.") {
            list = { type: "ordered_list", children: [], start: 1 };
          } else {
            list = { type: "bullet_list", children: [] };
          }
          Transforms.wrapNodes(editor, list, {
            match: (n) =>
              !Editor.isEditor(n) &&
              SlateElement.isElement(n) &&
              n.type === "list_item",
          });
        }

        return;
      }
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
