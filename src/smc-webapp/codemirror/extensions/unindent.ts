/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { cm_start_end } from "./util";

CodeMirror.defineExtension("unindent_selection", function () {
  // @ts-ignore
  const editor = this;

  for (let selection of editor.listSelections()) {
    const { start_line, end_line } = cm_start_end(selection);
    let all_need_unindent = true;
    for (let n = start_line; n <= end_line; n++) {
      const s = editor.getLine(n);
      if (s == null) {
        return;
      }
      if (s.length === 0 || s[0] === "\t" || s[0] === " ") {
        continue;
      } else {
        all_need_unindent = false;
        break;
      }
    }
    if (all_need_unindent) {
      for (let n = start_line; n <= end_line; n++) {
        editor.indentLine(n, "subtract");
      }
    }
  }
});
