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

import { markdown_it } from "../../../markdown";
import { math_escape } from "smc-util/markdown-utils";
import { remove_math, MATH_ESCAPE } from "smc-util/mathjax-utils";
import { endswith, startswith } from "smc-util/misc";

export interface Token {
  hidden?: boolean; // See https://markdown-it.github.io/markdown-it/#Token.prototype.hidden
  type: string;
  tag?: string;
  attrs?: string[][];
  children?: Token[];
  content: string;
  block?: boolean;
  markup?: string;
  checked?: boolean;
  info?: string;
}

// Set math tokens to have the math type, rather than "code_inline", which
// is what the markdown-it parser delivered them as.
// Why? We have a pre-processor that encodes math formulas as inline code, since
// markdown-it doesn't have a "math" type, and I think the markdown-it
// katex (or math) plugin simply doesn't work well enough due to
// limitations of markdown parsing (and complexity of latex formulas!).
// Here we set the type that we would like the token to have had.
function process_math_tokens(tokens: Token[]): void {
  for (const token of tokens) {
    if (
      token.type == "code_inline" &&
      startswith(token.content, MATH_ESCAPE) &&
      endswith(token.content, MATH_ESCAPE)
    ) {
      token.type = "math";
    }
    if (token.children != null) {
      process_math_tokens(token.children);
    }
  }
}

export function parse_markdown(
  markdown: string,
  obj: object = {}
): { tokens: Token[]; math } {
  let [text, math] = remove_math(
    math_escape(markdown),
    "`" + MATH_ESCAPE,
    MATH_ESCAPE + "`"
  );

  const tokens: Token[] = markdown_it.parse(text, obj);
  process_math_tokens(tokens);

  return { tokens, math };
}
