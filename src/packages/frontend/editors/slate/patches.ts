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

// I have seen cocalc.com crash in production randomly when editing markdown
// when calling range.  I think this happens when computing decorators, so
// it is way better to make it non-fatal for now.
export const withNonfatalRange = (editor) => {
  const { range } = editor;

  editor.range = (editor, at, to?) => {
    try {
      return range(editor, at, to);
    } catch (err) {
      console.log(`WARNING: range error ${err}`);
      const anchor = Editor.first(editor, []);
      return { anchor, focus: anchor };
    }
  };

  return editor;
};

// We patch the Editor.string command so that if the input
// location is invalid, it returns "" instead of crashing.
// This is useful, since Editor.string is mainly used
// for heuristic selection adjustment, copy, etc.
// In theory it should never get invalid input, but due to
// the loose nature of Slate, it's difficult to ensure this.
const unpatchedEditorString = Editor.string;
Editor.string = function (...args): string {
  try {
    return unpatchedEditorString(...args);
  } catch (err) {
    console.warn("WARNING: slate Editor.string -- invalid range", err);
    return "";
  }
};
