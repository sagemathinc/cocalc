/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This code ensures that there is always a text paragraph at the beginning
and end of the document.  This makes editing MUCH easier, since you can
always click or move the cursor before whatever is at the top and after
whatever is at the bottom!  Otherwise, you get annoyingly stuck sometimes.

Note that we strip out this extra paragraph stuff when converting to markdown,
and put it back when converting to slate, so you don't see lots of mysterious
vertical space (which would appear as &nbsp;'s) in the markdonw file itself.

*/

import { Editor, Text, Descendant } from "slate";
import { startswith, endswith } from "smc-util/misc";

export const PARAGRAPH = {
  type: "paragraph",
  children: [{ text: "" }],
} as Descendant;

function isTextParagraph(node: Descendant | undefined): boolean {
  return (
    node != null &&
    node["type"] == "paragraph" &&
    node["children"]?.length == 1 &&
    Text.isText(node["children"]?.[0])
  );
}

export function ensureDocNonempty(doc: Descendant[]): void {
  if (doc.length == 0) {
    doc.push(PARAGRAPH);
  }
}

// It is very important that the following two functions
// basically do the same thing.

export function ensureDocPadding(doc: Descendant[]): void {
  if (!isTextParagraph(doc[0])) {
    doc.unshift(PARAGRAPH);
  }
  if (!isTextParagraph(doc[doc.length - 1])) {
    doc.push(PARAGRAPH);
  }
}

export function ensureEditorPadding(editor: Editor): void {
  if (!isTextParagraph(editor.children[0])) {
    editor.apply({
      type: "insert_node",
      path: [0],
      node: PARAGRAPH,
    });
  }
  if (!isTextParagraph(editor.children[editor.children.length - 1])) {
    editor.apply({
      type: "insert_node",
      path: [editor.children.length],
      node: PARAGRAPH,
    });
  }
}

// Strip whitespace and &nbsp;'s from both sides of the string
// s, since we insert them in the slate document model to make
// editing bareable above.
// TODO: seems like a regexp problem...
export function trimPaddingFromMarkdown(s: string): string {
  while (true) {
    const n = s.length;
    s = s.trim();
    while (startswith(s, "&nbsp;")) {
      s = s.slice("&nbsp;".length);
    }
    while (endswith(s, "&nbsp;")) {
      s = s.slice(0, s.length - "&nbsp;".length);
    }
    if (s.length == n) {
      // didn't shrink.
      break;
    }
  }
  return s;
}
