/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant, Node } from "slate";

export function emptyParagraph() {
  // returns a new object each time.
  return {
    type: "paragraph",
    children: [{ text: "" }],
  } as Descendant;
}

export const EMPTY_PARAGRAPH = emptyParagraph(); // don't mutate this; won't work.
Object.freeze(EMPTY_PARAGRAPH);

export function isWhitespaceParagraph(node: Node | undefined): boolean {
  return (
    node != null &&
    node["type"] == "paragraph" &&
    node["children"]?.length == 1 &&
    isWhitespaceText(node["children"][0])
  );
}

export function isWhitespaceText(node: Node | undefined): boolean {
  return node?.["text"]?.trim() === "";
}

export function ensureDocNonempty(doc: Descendant[]): void {
  if (doc.length == 0) {
    doc.push(emptyParagraph());
  }
}
