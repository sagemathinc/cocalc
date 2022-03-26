/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// LaTeX code folding (isn't included in CodeMirror)

import * as CodeMirror from "codemirror";
import { startswith } from "@cocalc/util/misc";
import { trimStart } from "lodash";

function get_latex_environ(s: string): string | undefined {
  const i = s.indexOf("{");
  const j = s.indexOf("}");
  if (i !== -1 && j !== -1) {
    return s.slice(i + 1, j).trim();
  } else {
    return undefined;
  }
}

CodeMirror.registerHelper("fold", "stex", function (cm, start) {
  let line = trimStart(cm.getLine(start.line));
  const find_close = function () {
    const BEGIN = "\\begin";
    if (startswith(line, BEGIN)) {
      // \begin{foo}
      // ...
      // \end{foo}
      // find environment close
      const environ = get_latex_environ(line.slice(BEGIN.length));
      if (environ == null) {
        return [undefined, undefined];
      }
      // find environment close
      const END = "\\end";
      let level = 0;
      let begin, end;
      try {
        begin = new RegExp(`\\\\begin\\s*{${environ}}`);
        end = new RegExp(`\\\\end\\s*{${environ}}`);
      } catch (_err) {
        // This can happen, e.g., if somebody puts something totally wrong for the environment.
        // See https://github.com/sagemathinc/cocalc/issues/5794
        // Here's a reasonable fallback:
        return [undefined, undefined];
      }
      for (let i = start.line; i <= cm.lastLine(); i++) {
        const cur = cm.getLine(i);
        const m = cur.search(begin);
        const j = cur.search(end);
        if (m !== -1 && (j === -1 || m < j)) {
          level += 1;
        }
        if (j !== -1) {
          level -= 1;
          if (level === 0) {
            return [i, j + END.length - 1];
          }
        }
      }
    } else if (startswith(line, "\\[")) {
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (startswith(trimStart(cm.getLine(i)), "\\]")) {
          return [i, 0];
        }
      }
    } else if (startswith(line, "\\(")) {
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (startswith(trimStart(cm.getLine(i)), "\\)")) {
          return [i, 0];
        }
      }
    } else if (startswith(line, "\\documentclass")) {
      // pre-amble
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (startswith(trimStart(cm.getLine(i)), "\\begin{document}")) {
          return [i - 1, 0];
        }
      }
    } else if (startswith(line, "\\chapter")) {
      // book chapter
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (
          startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\end{document}"])
        ) {
          return [i - 1, 0];
        }
      }
      return [cm.lastLine(), 0];
    } else if (startswith(line, "\\section")) {
      // article section
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (
          startswith(trimStart(cm.getLine(i)), [
            "\\chapter",
            "\\section",
            "\\end{document}",
          ])
        ) {
          return [i - 1, 0];
        }
      }
      return [cm.lastLine(), 0];
    } else if (startswith(line, "\\subsection")) {
      // article subsection
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (
          startswith(trimStart(cm.getLine(i)), [
            "\\chapter",
            "\\section",
            "\\subsection",
            "\\end{document}",
          ])
        ) {
          return [i - 1, 0];
        }
      }
      return [cm.lastLine(), 0];
    } else if (startswith(line, "\\subsubsection")) {
      // article subsubsection
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (
          startswith(trimStart(cm.getLine(i)), [
            "\\chapter",
            "\\section",
            "\\subsection",
            "\\subsubsection",
            "\\end{document}",
          ])
        ) {
          return [i - 1, 0];
        }
      }
      return [cm.lastLine(), 0];
    } else if (startswith(line, "\\subsubsubsection")) {
      // article subsubsubsection
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (
          startswith(trimStart(cm.getLine(i)), [
            "\\chapter",
            "\\section",
            "\\subsection",
            "\\subsubsection",
            "\\subsubsubsection",
            "\\end{document}",
          ])
        ) {
          return [i - 1, 0];
        }
      }
      return [cm.lastLine(), 0];
    } else if (startswith(line, "%\\begin{}")) {
      // support what texmaker supports for custom folding -- http://tex.stackexchange.com/questions/44022/code-folding-in-latex
      for (let i = start.line + 1; i <= cm.lastLine(); i++) {
        if (startswith(trimStart(cm.getLine(i)), "%\\end{}")) {
          return [i, 0];
        }
      }
    }

    return [undefined, undefined]; // no folding here...
  };

  const [i, j] = find_close();
  if (i != null) {
    line = cm.getLine(start.line);
    let k = line.indexOf("}");
    if (k === -1) {
      k = line.length;
    }
    const range = {
      from: CodeMirror.Pos(start.line, k + 1),
      to: CodeMirror.Pos(i, j),
    };
    return range;
  } else {
    // nothing to fold
    return undefined;
  }
});
