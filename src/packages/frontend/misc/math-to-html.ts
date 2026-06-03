/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { macros } from "@cocalc/frontend/jquery-plugins/math-katex";
import katex from "katex";
import KaTeXCompatHacks from "./katex-compat-hacks";

export default function mathToHtml(
  math: string, // latex expression
  isInline: boolean,
  // Per-document macros (e.g. parsed from a .tex preamble's
  // \newcommand definitions). Merged on top of the built-in Sage
  // macro set so document definitions win — and, since KaTeX checks
  // the `macros` option before its own built-ins, they also override
  // KaTeX built-ins like \R, matching what the real LaTeX compile does.
  extraMacros: Record<string, string> | undefined = undefined,
  _ignore: Set<string> | undefined = undefined // used internally to avoid infinite recursion.
): { __html: string; err?: string } {
  if (!math.trim()) {
    // don't let it be empty, since then it is not possible to see/select.
    math = "\\LaTeX";
  }

  // Apply some hacks to deal with missing functionality in katex.
  math = KaTeXCompatHacks(math);

  // Default (no per-document macros): pass the shared `macros` object
  // unchanged, preserving the existing behavior where a \gdef/\newcommand
  // in one formula persists to later ones (katex mutates it under
  // globalGroup:true — see issue 5750). When per-document macros are
  // supplied (rich-edit preview), merge them on top into a throwaway
  // object so they win but nothing leaks back into the shared map.
  const allMacros =
    extraMacros != null ? { ...macros, ...extraMacros } : macros;

  let err: string | undefined = undefined;
  let html: string | undefined = undefined;
  try {
    html = katex.renderToString(math, {
      displayMode: !isInline,
      macros: allMacros,
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

    // TODO: See https://github.com/KaTeX/KaTeX/blob/main/src/macros.js for how to do this much better!
    // We can probably just slightly monkey patch how newcommand works... or something.
    err = error.toString();
    if (err?.endsWith("use \\renewcommand")) {
      const i = err.indexOf("redefine ");
      const j = err.lastIndexOf(";");
      const name = err.slice(i + "redefine ".length, j);
      if (!_ignore?.has(name) && allMacros[name] != null) {
        // Rewrite the inline `\newcommand` for THIS macro into a
        // `\renewcommand`. Match both the braced form
        // `\newcommand{\foo}` and the brace-less `\newcommand\foo`,
        // plus an optional `*`, tolerating whitespace; `name` already
        // includes the leading backslash. `(?![a-zA-Z])` stops `\foo`
        // from also matching `\foobar`. We only recurse when the
        // rewrite actually changed something — if the redefinition
        // came from `extraMacros` (not an inline `\newcommand`), there
        // is nothing to rewrite and retrying would not help.
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(
          "\\\\newcommand(\\*?\\s*\\{?\\s*)" + esc + "(?![a-zA-Z])"
        );
        const rewritten = math.replace(re, "\\renewcommand$1" + name);
        if (rewritten !== math) {
          return mathToHtml(
            rewritten,
            isInline,
            extraMacros,
            _ignore != null ? _ignore.add(name) : new Set([name])
          );
        }
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
