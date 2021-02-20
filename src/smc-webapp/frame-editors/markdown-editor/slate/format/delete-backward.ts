/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Range, Editor, Point, Transforms } from "slate";

export const withDeleteBackward = (editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    // See https://www.slatejs.org/examples/markdown-shortcuts
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const match = Editor.above(editor, {
        match: (n) => Editor.isBlock(editor, n),
      });

      if (match) {
        const [block, path] = match;
        const start = Editor.start(editor, path);
        if (
          block["type"] !== "paragraph" &&
          Point.equals(selection.anchor, start)
        ) {
          if (block["type"] === "list_item") {
            Transforms.unwrapNodes(editor, {
              match: (node) =>
                node["type"] === "bullet_list" ||
                node["type"] === "ordered_list",
              split: true,
            });
            return;
          }
        }
      }

      deleteBackward(...args);
    }
  };

  return editor;
};
