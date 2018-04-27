/*
Conversion from Markdown *to* HTML, trying not to horribly mangle math.
*/

import * as MarkdownIt from "markdown-it";

const misc = require("smc-util/misc");

const { remove_math, replace_math } = require("smc-util/mathjax-utils"); // from project Jupyter

const checkboxes = function(s) {
  s = misc.replace_all(s, "[ ]", "<i class='fa fa-square-o'></i>");
  return misc.replace_all(s, "[x]", "<i class='fa fa-check-square-o'></i>");
};

const OPTIONS: MarkdownIt.Options = {
  html: true,
  typographer: true,
  linkify: true
};

const markdown_it = new MarkdownIt(OPTIONS);

/*
Turn the given markdown *string* into an HTML *string*.
We heuristically try to remove and put back the math via
remove_math, so that checkboxes and markdown itself don't
mangle it too much before Mathjax/Katex finally see it.
Note that remove_math is NOT perfect, e.g., it messes up

<a href="http://abc" class="foo-$">test $</a>

However, at least it is from Jupyter, so agrees with them, so
people are used it it as a standard.
*/
export function markdown_to_html(markdown_string: string): string {
  let text: string;
  let math: string[];
  [text, math] = remove_math(markdown_string);
  // Process checkboxes [ ].
  text = checkboxes(text);
  // Render text to HTML.
  const html: string = markdown_it.render(text);
  // Substitute processed math back in.
  return replace_math(html, math);
}
