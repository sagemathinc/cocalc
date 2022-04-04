/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Node } from "slate";

// The version of isNodeList in slate is **insanely** slow, and this hack
// is likely to be sufficient for our use.
// This makes a MASSIVE different for larger documents!
Node.isNodeList = (value: any): value is Node[] => {
  return Array.isArray(value) && (value?.length == 0 || Node.isNode(value[0]));
};

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
