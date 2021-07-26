/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { macros } from "smc-webapp/jquery-plugins/math-katex";
import { renderToString } from "katex";
import * as LRU from "lru-cache";

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
