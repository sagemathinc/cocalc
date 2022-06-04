/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { macros } from "@cocalc/frontend/jquery-plugins/math-katex";
import katex from "katex";

export default function mathToHtml(
  math: string, // latex expression
  isInline: boolean,
  _ignore: Set<string> | undefined = undefined // used internally to avoid infinite recursion.
): { __html: string; err?: string } {
  if (!math.trim()) {
    // don't let it be empty, since then it is not possible to see/select.
    math = "\\LaTeX";
  }
  let err: string | undefined = undefined;
  let html: string | undefined = undefined;
  try {
    html = katex.renderToString(math, {
      displayMode: !isInline,
      macros,
      globalGroup: true, // See https://github.com/sagemathinc/cocalc/issues/5750
    });
  } catch (error) {
    // If you are working interactively, e.g., in a notebook or md file, you might change a macro
    // you have already defined.  Unfortunately, katex/latex assumes you're processing the whole document
    // top to bottom from a clean slate every time.  For iterative work that makes no sense.  Thus we
    // automate changing newcommand into renewcommand, as needed, with an escape hatch to avoid an
    // infinite loop.  NOTE: if you redefine a macro, all other formulas that depend on it do not automatically
    // get rerendered, so you do have to edit them slightly or close/open the document to see the changes.
    // But at least this is a good first step.  Also, with this approach you still do see an error if
    // try to define something like \lt that is built in!  There you should use \renewcommand explicitly.
    // Parsing this also helps with opening files in separate tabs, where the same macros get defined.
    err = error.toString();
    if (err?.endsWith("use \\renewcommand")) {
      const i = err.indexOf("redefine ");
      const j = err.lastIndexOf(";");
      const name = err.slice(i + "redefine ".length, j);
      if (!_ignore?.has(name) && macros[name] != null) {
        math = math.replace("\\newcommand{" + name, "\\renewcommand{" + name);
        return mathToHtml(
          math,
          isInline,
          _ignore != null ? _ignore.add(name) : new Set([name])
        );
      }
    }
  }
  return { __html: html ?? "", err };
}

export function latexMathToHtml(s: string): string {
  const { __html, err } = s.startsWith("$$")
    ? mathToHtml(s.slice(2, s.length - 2), false)
    : s.startsWith("$")
    ? mathToHtml(s.slice(1, s.length - 1), true)
    : mathToHtml(s, false);
  if (err) {
    return `<span style="color:#ff6666">${err}</span>`;
  } else {
    return __html;
  }
}

export function latexMathToHtmlOrError(s: string): {
  __html: string;
  err?: string;
} {
  return s.startsWith("$$")
    ? mathToHtml(s.slice(2, s.length - 2), false)
    : s.startsWith("$")
    ? mathToHtml(s.slice(1, s.length - 1), true)
    : mathToHtml(s, false);
}
