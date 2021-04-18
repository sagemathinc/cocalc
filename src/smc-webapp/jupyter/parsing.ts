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

/*
We would like that the following two conditions hold:
     (1) `(unescape ∘ escape)(code) ≡ code`
     (2) `escape(code)` is valid python if code is valid python combined with ipython magics.
However, the code below does not actually satisfy both of these conditions for all input and
can probably dangerously mangle carefully crafted input.  Life is short, and somebody should
fix this properly (is there a parser that Jupyter itself uses for processing magics that we
could hook into?)  See https://github.com/sagemathinc/cocalc/pull/5291/.

This function is inspired by
 https://github.com/drillan/jupyter-black/blob/master/jupyter-black.js
*/
export function process_magics(
  code,
  syntax: Syntax,
  mode: "escape" | "unescape"
): string {
  if (syntax !== "python3") return code;

  switch (mode) {
    case "escape":
      return code
        .split("\n")
        .map((line) =>
          line.replace(/^\%(.*)$/, (m, g1) =>
            g1 != null ? `#%%%#%${g1}` : /* should not happen */ m
          )
        )
        .join("\n");
    case "unescape":
      return code
        .split("\n")
        .map((line) =>
          line.replace(/^#\%{3}#(.*)$/, (m, g1) =>
            g1 != null ? `${g1}` : /* should not happen */ m
          )
        )
        .join("\n");
  }
}
