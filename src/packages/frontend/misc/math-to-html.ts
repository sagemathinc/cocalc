/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { macros } from "@cocalc/frontend/jquery-plugins/math-katex";
import katex from "katex";

export default function mathToHtml(
  math: string, // latex expression
  isInline: boolean
): { __html: string; err?: string } {
  if (!math.trim()) {
    // don't let it be empty since then it is not possible to see/select.
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
    err = error.toString();
  }
  return { __html: html ?? "", err };
}

export function latexMathToHtml(s: string): string {
  const { __html, err } = s.startsWith("$$")
    ? mathToHtml(s.slice(2, s.length - 2), false)
    : mathToHtml(s.slice(1, s.length - 1), true);
  if (err) {
    return `<span style="color:#ff6666">${err}</span>`;
  } else {
    return __html;
  }
}
