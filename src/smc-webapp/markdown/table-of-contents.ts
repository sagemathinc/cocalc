/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use markdown-it (with no plugins for speed purposes) to parse out the
table of contents data from a markdown string.

Using a parser rather than just searching for lines that start with #
is of course far better, since it properly avoids fenced blocks that
contain #'s, etc.    We *do* worry about math formulas
that might randomly begin a line with a "# ", since that's the
one extra thing we better do.
*/

import { remove_math, replace_math } from "smc-util/mathjax-utils";
import { TableOfContentsEntry as Entry } from "../r_misc";

import { Token } from "./types";
import * as MarkdownIt from "markdown-it";
import { OPTIONS } from "./index";

const markdown_it = new MarkdownIt(OPTIONS);

// NOTE: headings can't be nested in markdown, which makes parsing much easier.

export function parseTableOfContents(markdown: string): Entry[] {
  let id = 0;
  const entries: Entry[] = [];
  let entry: Entry | undefined = undefined;
  let number: number[] = [0];
  const [text, math] = remove_math(markdown);
  function parse(tokens: Token[]): void {
    for (const token of tokens) {
      if (token.type == "heading_open") {
        const level = parseInt(token.tag?.slice(1) ?? "1") as any;
        number = number.slice(0, level);
        if (number.length < level) {
          while (number.length < level) {
            number.push(1);
          }
        } else {
          number[number.length - 1] += 1;
        }
        entry = { level, value: "", id: `${id}`, number: [...number] };
        id += 1;
        continue;
      }
      if (entry != null && token.type == "heading_close") {
        entries.push(entry);
        entry = undefined;
        continue;
      }
      if (entry != null && token.type == "text") {
        entry.value += replace_math(token.content, math);
        continue;
      }
      if (token.children != null) {
        parse(token.children);
        continue;
      }
    }
  }
  parse(markdown_it.parse(text, {}));
  return entries;
}
