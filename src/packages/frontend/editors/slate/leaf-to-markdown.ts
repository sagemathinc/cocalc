/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import { markInlineText, markdownEscape } from "./util";
import { startswith } from "@cocalc/util/misc";
import { Info } from "./slate-to-markdown";

export function serializeLeaf(node: Text, info: Info): string {
  let text = node.text;

  if (text.length > 0) {
    // Only apply formatting if the text is non-empty; otherwise, it's pointless and confusing.

    /*
  TODO: Markdown escaping is confusing when one user is
  working in the source side and the other in slatejs at the same time.
  I don't know any solution for that yet.
  NOTE: disabling this would have interesting implications for being able to type markdown
  into slatej, and have it autoconvert to rendered (e.g., backticks --> code).
  */
    if (
      !info.no_escape &&
      !node.code &&
      info.parent?.["type"] != "code_block"
    ) {
      text = markdownEscape(text, info.index == 0);
    }

    const marks: { left: string; right?: string }[] = [];
    // Proper markdown annotation.
    if (node.code) {
      // code *must* be first, since in markdown ~~`var`~~ is completely different than `~~var~~`.
      marks.push({ left: "`" });
    }
    if (node.bold) {
      marks.push({ left: "**" });
    }
    if (node.italic) {
      marks.push({ left: "_" });
    }
    if (node.strikethrough) {
      marks.push({ left: "~~" });
    }
    if (node.tt) {
      // tt is deprecated, so we don't want to encourage it; we automatically
      // normalize it to equivalent span.
      marks.push({
        left: "<span style='font-family:monospace'>",
        right: "</span>",
      });
    }

    // Using html to provide some things markdown doesn't provide,
    // but they can be VERY useful in practice for our users.
    if (node.underline) {
      marks.push({ left: "<u>", right: "</u>" });
    }
    for (const c of ["sup", "sub", "small"]) {
      if (node[c]) {
        marks.push({ left: `<${c}>`, right: `</${c}>` });
      }
    }
    // colors and fonts
    for (const mark in node) {
      if (!node[mark]) continue; // only if true
      for (const c of ["color", "font-family", "font-size"]) {
        if (startswith(mark, `${c}:`)) {
          marks.push({
            left: `<span style='${mark}'>`,
            right: "</span>",
          });
        }
      }
    }
    for (const mark of marks) {
      text = markInlineText(text, mark.left, mark.right);
    }
  }

  if (info.hook != null) {
    // always do this (even if text empty), e.g., it could be putting a special marker in.
    const h = info.hook(node);
    if (h != null) return h(text);
  }

  return text;
}
