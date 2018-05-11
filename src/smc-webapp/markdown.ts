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
  typographer: false,
  linkify: true
};

const markdown_it = new MarkdownIt(OPTIONS);

/* The markdown processor markedown-it seems to escape
a bunch of characters that are relevant to later mathjax
processing.  This is annoying, violates the Markdown spec
(https://daringfireball.net/projects/markdown/syntax#backslash),
and breaks things.  So we remove them first.
*/

const escape_map = "$()[]";
const unescape_map =
  "\uFE22\uFE23\uFE24\uFE25\uFE26"; /* we just use some unallocated unicode... */

function math_escape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = misc.replace_all(s, "\\" + escape_map[i], unescape_map[i]);
  }
  return s;
}

function math_unescape(s: string): string {
  for (let i = 0; i < escape_map.length; i++) {
    s = misc.replace_all(s, unescape_map[i], "\\" + escape_map[i]);
  }
  return s;
}

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

export function markdown_to_html(markdown_string: string): string {
  let text: string;
  let math: string[];
  // console.log(0, JSON.stringify(markdown_string));
  // console.log(1, JSON.stringify(math_escape(markdown_string)));
  [text, math] = remove_math(math_escape(markdown_string));
  // console.log(2, JSON.stringify(text), JSON.stringify(math));
  // Process checkboxes [ ].
  text = checkboxes(text);
  // Render text to HTML.
  let html: string = markdown_it.render(text);
  // console.log(3, JSON.stringify(html));
  // Substitute processed math back in.
  html = replace_math(html, math);
  // console.log(4, JSON.stringify(html));
  html = math_unescape(html);
  // console.log(5, JSON.stringify(html));

  return html;
}
