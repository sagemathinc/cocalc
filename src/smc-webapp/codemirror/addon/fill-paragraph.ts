/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Analogue of fill-paragraph from emacs.  It's basically what is described
in here, but not *exactly*.

https://www.gnu.org/software/emacs/manual/html_node/emacs/Fill-Commands.html
*/

import * as CodeMirror from "codemirror";
import { Pos } from "./types";
import { split } from "smc-util/misc";

function is_white_space(s: string): boolean {
  return s?.trim() == "";
}

CodeMirror.defineExtension("fill_paragraph", function (opts: {
  cols?: number;
}): void {
  // @ts-ignore
  const cm: CodeMirror.Editor = this;
  const pos: Pos = cm.getCursor();

  const cols = opts?.cols ?? 80;

  let n = pos.line;
  // enforce emacs rule when cursor is between paragraphs: go to next para
  while (is_white_space(cm.getLine(n)) && n < cm.lastLine()) {
    n += 1;
  }

  // find the start line and end line of the current paragraph
  let start = n;
  while (start > cm.firstLine() && !is_white_space(cm.getLine(start))) {
    start -= 1;
  }
  while (is_white_space(cm.getLine(start)) && start < cm.lastLine()) {
    start += 1;
  }
  let end = n;
  while (end < cm.lastLine() && !is_white_space(cm.getLine(end))) {
    end += 1;
  }
  while (is_white_space(cm.getLine(end)) && end > cm.firstLine()) {
    end -= 1;
  }

  // Now start and end are valid lines in the document and they are where the
  // paragraph actually starts and ends.  They are not whitespace lines, unless
  // document is entirely whitespace.
  const from = { line: start, ch: 0 };
  const to = { line: end, ch: cm.getLine(end).length + 1 };
  let para = cm.getRange(from, to);

  // Find a single character not in the range and put it at the cursor, so
  // we can track where the cursor goes when we do the replacement.
  // We only have to do this if the cursor is in the range.
  let cursor: string = "";
  if (pos.line >= start && pos.line <= end) {
    let code = 1000;
    cursor = String.fromCharCode(code);
    while (para.indexOf(cursor) != -1) {
      code += 1;
      cursor = String.fromCharCode(code);
    }
    cm.replaceRange(cursor, pos);
    para = cm.getRange(from, to); // now it has the sentinel character in it.
  }

  const words = split(para);
  let formatted = "";
  let k = 0;
  for (const word of words) {
    let next = (k > 0 ? " " : "") + word;
    if (k > 0 && k + next.length > cols) {
      formatted += "\n";
      k = 0;
      next = word;
    }
    formatted += next;
    k += next.length;
  }
  cm.replaceRange(formatted, from, to);

  if (cursor != "") {
    for (let line = from.line; line <= to.line; line++) {
      const x = cm.getLine(line);
      if (x == null) continue;
      const ch = x.indexOf(cursor);
      if (ch != -1) {
        const before = x.slice(0, ch);
        let after = x.slice(ch + cursor.length);
        if (
          is_white_space(after[0]) &&
          is_white_space(before[before.length - 1])
        ) {
          after = after.slice(1);
        }
        cm.replaceRange(
          before + after,
          { line, ch: 0 },
          { line, ch: cm.getLine(line).length }
        );
        cm.setCursor({ ch, line });
        break;
      }
    }
  }
});
