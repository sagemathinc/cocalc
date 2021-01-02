/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Conversion from Markdown *to* HTML, trying not to horribly mangle math.

TODO: right now [ ] in pre/code gets turned into a unicode checkbox, which is
perhaps annoying... e.g., this is wrong:
```
X[ ]
```
*/

import * as MarkdownIt from "markdown-it";
const MarkdownItFrontMatter = require("markdown-it-front-matter");
import * as misc from "smc-util/misc";
import { math_escape, math_unescape } from "smc-util/markdown-utils";
const { remove_math, replace_math } = require("smc-util/mathjax-utils"); // from project Jupyter

const checkboxes = function (s) {
  s = misc.replace_all(s, "[ ]", "☐");
  return misc.replace_all(s, "[x]", "☑");
};

const OPTIONS: MarkdownIt.Options = {
  html: true,
  typographer: false,
  linkify: true,
};

export const markdown_it = new MarkdownIt(OPTIONS);

/*
Inject line numbers for sync.
 - We track only headings and paragraphs, at any level.
 - TODO Footnotes content causes jumps. Level limit filters it automatically.

See https://github.com/digitalmoksha/markdown-it-inject-linenumbers/blob/master/index.js
*/
function inject_linenumbers_plugin(md) {
  function injectLineNumbers(tokens, idx, options, env, slf) {
    if (tokens[idx].map) {
      const line = tokens[idx].map[0];
      tokens[idx].attrJoin("class", "source-line");
      tokens[idx].attrSet("data-source-line", String(line));
    }
    return slf.renderToken(tokens, idx, options, env, slf);
  }

  md.renderer.rules.paragraph_open = injectLineNumbers;
  md.renderer.rules.heading_open = injectLineNumbers;
  md.renderer.rules.list_item_open = injectLineNumbers;
  md.renderer.rules.table_open = injectLineNumbers;
}
const markdown_it_line_numbers = new MarkdownIt(OPTIONS);
markdown_it_line_numbers.use(inject_linenumbers_plugin);

/*
Turn the given markdown *string* into an HTML *string*.
We heuristically try to remove and put back the math via
remove_math, so that checkboxes and markdown itself don't
mangle it too much before Mathjax/Katex finally see it.
Note that remove_math is NOT perfect, e.g., it messes up

<a href="http://abc" class="foo-$">test $</a>

However, at least it is from Jupyter, so agrees with them, so
people are used it it as a standard.

See https://github.com/sagemathinc/cocalc/issues/2863
for another example where remove_math is annoying.
*/

export interface MD2html {
  html: string;
  frontmatter: string;
}

function process(
  markdown_string: string,
  mode: "default" | "frontmatter",
  options?: { line_numbers?: boolean }
): MD2html {
  let text: string;
  let math: string[];
  // console.log(0, JSON.stringify(markdown_string));
  // console.log(1, JSON.stringify(math_escape(markdown_string)));
  [text, math] = remove_math(math_escape(markdown_string));
  // console.log(2, JSON.stringify(text), JSON.stringify(math));
  // Process checkboxes [ ].
  text = checkboxes(text);

  let html: string;
  let frontmatter = "";

  // avoid instantiating a new markdown object for normal md processing
  if (mode == "frontmatter") {
    const md_frontmatter = new MarkdownIt(OPTIONS).use(
      MarkdownItFrontMatter,
      (fm) => {
        frontmatter = fm;
      }
    );
    html = md_frontmatter.render(text);
  } else {
    if (options?.line_numbers) {
      html = markdown_it_line_numbers.render(text);
    } else {
      html = markdown_it.render(text);
    }
  }

  // console.log(3, JSON.stringify(html));
  // Substitute processed math back in.
  html = replace_math(html, math);
  // console.log(4, JSON.stringify(html));
  html = math_unescape(html);
  // console.log(5, JSON.stringify(html));
  return { html, frontmatter };
}

export function markdown_to_html_frontmatter(s: string): MD2html {
  return process(s, "frontmatter");
}

export function markdown_to_html(
  s: string,
  options?: { line_numbers?: boolean }
): string {
  return process(s, "default", options).html;
}
