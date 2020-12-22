/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support  tab/control+space completions when editing tex documents.

This just uses the file webapp-lib/codemirror-extra/data/latex-completions.txt,
and I can't remember where that came from or how to update it.
*/

import * as CodeMirror from "codemirror";
import { startswith } from "smc-util/misc";

const data = require("raw-loader!codemirror-extra/data/latex-completions.txt");
let completions = data.split("\n");

function tex_hint(editor) {
  const cur = editor.getCursor();

  // Find the most recent backslash, since all our completions start with backslash.
  const line = editor.getLine(cur.line);
  const s = line.slice(0, cur.ch);
  const i = s.lastIndexOf("\\");
  const list: string[] = [];
  if (i == -1) {
    // nothing to complete
  } else {
    // maybe something -- search
    // First, as a convenience if user completes `\begin{it[cursor here]}` do not
    // end up with two close braces. This helps compensate with the
    // "Auto close brackets: automatically close brackets" mode.
    const delete_trailing_brace = line[cur.ch] == "}";
    const t = s.slice(i);
    for (const word of completions) {
      if (startswith(word, t)) {
        if (delete_trailing_brace && word[word.length - 1] == "}") {
          list.push(word.slice(0, word.length - 1));
        } else {
          list.push(word);
        }
      }
    }
  }
  return {
    list,
    from: CodeMirror.Pos(cur.line, i),
    to: CodeMirror.Pos(cur.line, cur.ch),
  };
}

CodeMirror.registerHelper("hint", "stex", tex_hint);
