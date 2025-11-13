/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// See https://github.com/sagemathinc/cocalc/issues/6311 for why we have \n in our search
// This is to avoid "false positives".
export function parseHeader(markdown: string): {
  header: string | undefined;
  body: string;
} {
  // starts with a line that equals *exactly* ---.
  if (markdown.slice(0, 4) == "---\n") {
    // YAML metadata header -- must contain a second line later that is exactly --- and a newline.
    const j = markdown.indexOf("\n---\n", 4);
    if (j != -1) {
      return { header: markdown.slice(4, j), body: markdown.slice(j + 4) };
    }
  }
  return { header: undefined, body: markdown };
}
