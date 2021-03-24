/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


import { Node, Location, Editor } from "slate";

export function containingBlock(editor: Editor): undefined | [Node, Location] {
  for (const x of Editor.nodes(editor, {
    match: (node) => Editor.isBlock(editor, node),
  })) {
    return x;
  }
}
