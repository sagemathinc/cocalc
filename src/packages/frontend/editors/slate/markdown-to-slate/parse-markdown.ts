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
*/

import { markdown_it, parseHeader } from "@cocalc/frontend/markdown";

// Use this instead of the above to test with no plugins, which
// can be useful for isolating performance issues.
//import MarkdownIt from "markdown-it";
//const markdown_it = new MarkdownIt();

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, MATH_ESCAPE } from "@cocalc/util/mathjax-utils";
import { endswith, startswith } from "@cocalc/util/misc";
import { replace_math } from "../util";
import { Token } from "./types";

// Set math tokens to have the math type, rather than "code_inline" and fenced blocks, which
// is what the markdown-it parser delivered them as.
// Why? We have a pre-processor that encodes math formulas as inline code, since
// markdown-it doesn't have a "math" type, and I think the markdown-it
// katex (or math) plugin simply doesn't work well enough due to
// limitations of markdown parsing (and complexity of latex formulas!).
// Here we set the type that we would like the token to have had.
function process_math_tokens(tokens: Token[], math): void {
  for (const token of tokens) {
    const content = token.content.trim();
    if (startswith(content, MATH_ESCAPE) && endswith(content, MATH_ESCAPE)) {
      let set_content = false;
      let j: number = 1;
      if (token.type == "code_inline") {
        token.type = "inline_math";
        set_content = true;
        j = 1;
      } else if (token.type == "fence") {
        token.type = "display_math";
        set_content = true;
        j = 2;
      }
      if (set_content) {
        const i = MATH_ESCAPE.length;
        const n = parseInt(content.slice(i, content.length - i));
        if (math[n] != null) {
          if (
            math[n].startsWith("$") ||
            math[n].startsWith("\\(") ||
            math[n].startsWith("\\[")
          ) {
            // only truncate if math is in $'s.  Math could be also
            // be things like \begin{...} \end{...} that gets auto
            // detected and has no delims around it.
            token.content = math[n].slice(j, math[n].length - j);
          } else {
            // anything autodected, e.g., \begin{equation} ...,
            // has to be in display mode, or it gives an error.
            token.type = "display_math";
            token.content = math[n];
          }
        }
      }
    } else {
      // Put any math we removed back in unchanged (since the math parsing doesn't
      // know anything about things like code blocks, html, etc., and doesn't know
      // to ignore them).  Basically, this works around that the heuristic in
      // remove_math is not 100% perfect.
      if (token.content != null) {
        token.content = replace_math(token.content, math);
        token.content = math_unescape(token.content);
      }
    }
    if (token.children != null) {
      process_math_tokens(token.children, math);
    }
  }
}

// For each line that ends in a single trailing space
// instead make it end in the following unused unicode
// character:
const TRAILING_WHITESPACE_SUB = "\uFE20";
const TRAILING_WHITESPACE_REG = /\uFE20/g;
// On the slate side, we substitute these back as spaces.
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
  // This one little regexp does exactly what we want:
  // (?<=\S) = match a non-whitespace but don't capture it - see https://stackoverflow.com/questions/3926451/how-to-match-but-not-capture-part-of-a-regex
  // \  = single space
  // $ = end of line, because of the "m"
  // gm = global and m means $ matches end of each line, not whole string.
  return markdown.replace(/(?<=\S)\ $/gm, TRAILING_WHITESPACE_SUB);
}

function restoreSingleTrailingWhitespace(tokens) {
  for (const token of tokens) {
    if (token.content && token.content.includes(TRAILING_WHITESPACE_SUB)) {
      token.content = token.content.replace(TRAILING_WHITESPACE_REG, " ");
      if (token.children != null) {
        restoreSingleTrailingWhitespace(token.children);
      }
    }
  }
}

export function parse_markdown(
  markdown: string,
  no_meta?: boolean
): { tokens: Token[]; meta?: string } {
  // const t0 = new Date().valueOf();
  let meta: undefined | string = undefined;

  if (!no_meta) {
    const x = parseHeader(markdown);
    markdown = x.body;
    meta = x.header;
  }

  markdown = replaceSingleTrailingWhitespace(markdown);
  markdown = math_escape(markdown);
  let [text, math] = remove_math(markdown, {
    open: "`" + MATH_ESCAPE,
    close: MATH_ESCAPE + "`",
    display_open: "\n```\n" + MATH_ESCAPE,
    display_close: MATH_ESCAPE + "\n```\n",
  });

  const tokens: Token[] = markdown_it.parse(text, {});
  process_math_tokens(tokens, math);
  // window.parse_markdown = { tokens, meta };
  // console.log("time: parse_markdown", new Date().valueOf() - t0, " ms");
  // console.log("tokens", tokens);
  restoreSingleTrailingWhitespace(tokens);
  return { tokens, meta };
}
