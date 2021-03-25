/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node, Location, Editor, Path } from "slate";

export function containingBlock(editor: Editor): undefined | [Node, Location] {
  for (const x of Editor.nodes(editor, {
    match: (node) => Editor.isBlock(editor, node),
  })) {
    return x;
  }
}

export function getNodeAt(editor: Editor, path: Path): undefined | Node {
  try {
    return Editor.node(editor, path)[0];
  } catch (_) {
    return;
  }
}
