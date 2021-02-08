/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant } from "slate";

export function emptyParagraph() {
  return {
    type: "paragraph",
    children: [{ text: "" }],
  } as Descendant;
}

export function ensureDocNonempty(doc: Descendant[]): void {
  if (doc.length == 0) {
    doc.push(emptyParagraph());
  }
}
