/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functions for parsing input, etc.
This can *ONLY* be used from the browser!
*/

const { endswith } = require("smc-util/misc");
import { Syntax } from "smc-util/code-formatter";

import * as CodeMirror from "codemirror";

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

function last_style(code: string, mode = "python"): string | null | undefined {
  let style: string | null | undefined = undefined;
  CodeMirror.runMode(code, mode, (_, s) => {
    style = s;
  });
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
      // This below check guarantees we do not unescape a line that was never escaped.
      // TODO: Instead of failing, we could increase the number of percents in s='#%...%%#'
      // until s is not found in the code, then use that.  The result would then work
      // on arbitrary input (however, other things are more important right now).
      if (code.match(/^#\%{3}#/gm)?.length > 0) {
        throw new Error(
          "Cells with lines starting with '#%%%#' cannot be formatted."
        );
      }
      return code
        .split("\n")
        .map((line) =>
          line.replace(/^\%(.*)$/, (m, g1) => (g1 != null ? `#%%%#%${g1}` : m))
        )
        .join("\n");
    case "unescape":
      return code
        .split("\n")
        .map((line) =>
          line.replace(/^#\%{3}#(.*)$/, (m, g1) => (g1 != null ? `${g1}` : m))
        )
        .join("\n");
  }
}
