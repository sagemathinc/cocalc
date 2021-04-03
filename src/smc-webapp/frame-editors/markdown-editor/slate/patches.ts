/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Node, Transforms } from "slate";

// The version of isNodeList in slate is **insanely** slow, and this hack
// is likely to be sufficient for our use.
// This makes a MASSIVE different for larger documents!
Node.isNodeList = (value: any): value is Node[] => {
  return Array.isArray(value) && (value?.length == 0 || Node.isNode(value[0]));
};

// This is hack that addresses https://github.com/ianstormtaylor/slate/issues/4131
export function withFix4131(editor: Editor) {
  var a = editor;
  var { apply } = editor;

  a.apply = function (op) {
    apply(op);
    if (op.type === "remove_node" && op.path[op.path.length - 1] === 0) {
      Transforms.setSelection(a, {
        anchor: { path: op.path, offset: 0 },
        focus: { path: op.path, offset: 0 },
      });
    }
  };

  return a;
}
