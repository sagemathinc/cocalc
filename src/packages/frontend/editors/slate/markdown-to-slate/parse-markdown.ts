/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

import type { References, Token } from "./types";

// Before feeding to markdown-it and tokenizing, for
// each line that ends in a single trailing space,
// append the following unused unicode character:
const TRAILING_WHITESPACE_CHR = "\uFE20";
const TRAILING_WHITESPACE_SUB = " " + TRAILING_WHITESPACE_CHR;
const TRAILING_WHITESPACE_REG = /\uFE20/g;
// Once tokenized, we remove the funny unicode character, leaving the
// single trailing space.
// This is critical to do since markdown-it (and the markdown spec)
// just silently removes a single trailing space from any line,
// but that's often what people type as they are typing.  With
// collaborative editing, this is a massive problem, since one
// user removes the other user's trailing space, which results in
// merge conflicts and thus dropped content. Super annoying.
// Note that this sort of problem can still happen when the user
// types *two spaces* temporarily at the end of a line.  However,
// that means newline in markdown, and at this point there is little
// that can be done.
function replaceSingleTrailingWhitespace(markdown: string): string {
  // This one little regexp does exactly what we want...
  // (?<=\S) = match a non-whitespace but don't capture it - see https://stackoverflow.com/questions/3926451/how-to-match-but-not-capture-part-of-a-regex
  // \  = single space
  // $ = end of line, because of the "m"
  // gm = global and m means $ matches end of each line, not whole string.
  //return markdown.replace(/(?<=\S)\ $/gm, TRAILING_WHITESPACE_SUB);
  // Above isn't supported by Safari, but
  // https://stackoverflow.com/questions/51568821/works-in-chrome-but-breaks-in-safari-invalid-regular-expression-invalid-group
  // suggests a slight modification that is UGLIER and slower, but works:
  return markdown.replace(
    /(?:\S)\ $/gm,
    (match) => match[0] + TRAILING_WHITESPACE_SUB,
  );
}

function restoreSingleTrailingWhitespace(tokens) {
  for (const token of tokens) {
    if (token.content && token.content.includes(TRAILING_WHITESPACE_CHR)) {
      token.content = token.content.replace(TRAILING_WHITESPACE_REG, "");
      if (token.children != null) {
        restoreSingleTrailingWhitespace(token.children);
      }
    }
  }
}

export function parse_markdown(
  markdown: string,
  no_meta?: boolean,
): {
  tokens: Token[];
  meta?: string;
  lines: string[];
  references?: References;
} {
  // const t0 = Date.now();
  let meta: undefined | string = undefined;

  markdown = trailingCodeblockWhitespaceHack(markdown);

  if (!no_meta) {
    const x = parseHeader(markdown);
    markdown = x.body;
    meta = x.header;
  }

  const lines = markdown.split("\n");
  markdown = replaceSingleTrailingWhitespace(markdown);
  const state: any = {};
  const tokens: Token[] = markdown_it.parse(markdown, state);
  restoreSingleTrailingWhitespace(tokens);

  // window.parse_markdown = { tokens, meta };
  // console.log("time: parse_markdown", Date.now() - t0, " ms");
  // console.log("tokens", tokens);
  return { tokens, meta, lines, references: state.references };
}

function trailingCodeblockWhitespaceHack(markdown: string): string {
  // Markdown-it leaves in the ending ``` when there happens to be
  // whitespace after it, but otherwise doesn't.  This throws off the
  // code below, so we have to strip it. See
  //   https://github.com/sagemathinc/cocalc/issues/6564
  // I don't understand *why* this is needed, but it should be harmless
  // and I can't find any way around doing this.  I tried disabling all
  // extensions, updating markdown-it, etc., and it just parses
  // code blocks wrong if there is trailing whitespace, despite the
  // online demo seeming fine.
  if (!markdown) {
    // some weird situation even resulted being undefined in prod, and
    // this special case also works around that...
    return "";
  }
  // This reg exp just deletes the trailing whitespace from the backticks
  // that define code blocks.  it's tricky since it involves capture groups
  // since one can use more than 3 backticks as a delimiter.
  return markdown.replace(/^(```+)\s+$/gm, "$1");
}
