/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This parses markdown using our markdown-it based parser,
but math-enhanced beyond what just markdown provides, by
stripping math first before considering markdown.  This avoids
issues with math formulas that can be mistaken for markdown
syntax, which is a problem with many math markdown plugins.

To quote the markdown-it docs: "Why not AST? Because it's
not needed for our tasks. We follow KISS principle. If you wish -
you can call a parser without a renderer and convert the token
stream to an AST."  That AST is what slate is.
https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md
*/

import { markdown_it, parseHeader } from "@cocalc/frontend/markdown";

// Use this instead of the above to test with no plugins, which
// can be useful for isolating performance issues.
//import MarkdownIt from "markdown-it";
//const markdown_it = new MarkdownIt();

import type { Token } from "./types";

export function parse_markdown(
  markdown: string,
  no_meta?: boolean
): {
  tokens: Token[];
  meta?: string;
  lines: string[];
} {
  // const t0 = new Date().valueOf();
  let meta: undefined | string = undefined;

  if (!no_meta) {
    const x = parseHeader(markdown);
    markdown = x.body;
    meta = x.header;
  }

  const lines = markdown.split("\n");
  const tokens: Token[] = markdown_it.parse(markdown, {});

  //window.parse_markdown = { tokens, meta };
  // console.log("time: parse_markdown", new Date().valueOf() - t0, " ms");
  // console.log("tokens", tokens);
  return { tokens, meta, lines };
}
