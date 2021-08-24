/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { macros } from "@cocalc/frontend/jquery-plugins/math-katex";
import { renderToString } from "katex";
import LRU from "lru-cache";

const cache = new LRU({ max: 200 });

export default function mathToHtml(
  math: string, // latex expression
  isInline: boolean
): { __html: string; err?: string } {
  const key = `${isInline}` + math;
  let { html, err } = (cache.get(key) ?? {}) as any;
  if (html != null) {
    return { __html: html ?? "", err };
  }
  if (!math.trim()) {
    // don't let it be empty since then it is not possible to see/select.
    math = "\\LaTeX";
  }
  try {
    html = renderToString(math, {
      displayMode: !isInline,
      macros,
    });
  } catch (error) {
    err = error.toString();
  }
  cache.set(key, { html, err });
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
