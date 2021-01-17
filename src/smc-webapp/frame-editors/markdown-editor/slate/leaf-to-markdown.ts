/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import { mark_inline_text, markdown_escape } from "./util";
import { startswith } from "smc-util/misc";
import { Info } from "./slate-to-markdown";

export function serializeLeaf(node: Text, info: Info): string {
  let text = node.text;
  if (!info.no_escape && !node.code && info.parent.type != "code_block") {
    text = markdown_escape(text);
  }

  const marks: { left: string; right?: string }[] = [];
  // Proper markdown annotation.
  if (node.bold) {
    marks.push({ left: "**" });
  }
  if (node.italic) {
    marks.push({ left: "_" });
  }
  if (node.strikethrough) {
    marks.push({ left: "~~" });
  }
  if (node.code) {
    marks.push({ left: "`" });
  }

  // Using html to provide some things markdown doesn't provide,
  // but they can be VERY useful in practice for our users.
  if (node.underline) {
    marks.push({ left: "<u>", right: "</u>" });
  }
  for (const c of ["sup", "sub"]) {
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
    text = mark_inline_text(text, mark.left, mark.right);
  }
  return text;
}
