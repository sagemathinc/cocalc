/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functions for parsing input, etc.
This can *ONLY* be used from the browser!
*/

const { endswith } = require("smc-util/misc");
import { Syntax } from "../../smc-util/code-formatter";

declare const CodeMirror: any; // TODO: import?

export function run_mode(code: string, mode: string, language: string) {
  if (!code) {
    // code assumed trimmed
    return "empty";
  } else if (language !== "prolog") {
    const needle = last_style(code, mode);
    if (needle === "comment" || needle === "string") {
      return "execute";
    } else if (endswith(code, "??")) {
      // TODO: can we not just use "string.endsWith"?
      return "show_source";
    } else if (endswith(code, "?")) {
      return "show_doc";
    }
  }
  return "execute";
}

function last_style(code: string, mode = "python") {
  let style = undefined;
  CodeMirror.runMode(code, mode, (_, s) => (style = s));
  return style;
}

// calling escape and then unescape should be idempotent
// python is inspired by https://github.com/drillan/jupyter-black/blob/master/jupyter-black.js
export function process_magics(
  code,
  syntax: Syntax,
  mode: "escape" | "unescape"
): string {
  if (syntax !== "python3") return code;

  code = `${code}\n`; // for the regex, we need a \n at the end!
  switch (mode) {
    case "escape":
      return code.replace(/\%(.*)\n/g, (m, g1) =>
        g1 != null ? `#%#%${g1}\n` : /* should not happen */ m
      );
    case "unescape":
      return code.replace(/#\%#(.*)\n/g, (m, g1) =>
        g1 != null ? `${g1}\n` : /* should not happen */ m
      );
  }
}
