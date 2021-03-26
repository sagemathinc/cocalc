/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function parseHeader(
  markdown: string
): { header: string; body: string } {
  if (markdown.slice(0, 3) == "---") {
    // YAML metadata header
    const j = markdown.indexOf("---", 3);
    if (j != -1) {
      return { header: markdown.slice(4, j - 1), body: markdown.slice(j + 4) };
    }
  }
  return { header: "", body: markdown };
}
