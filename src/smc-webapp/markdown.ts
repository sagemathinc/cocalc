/*
Conversion from Markdown *to* HTML, trying not to horribly mangle math.
*/

import * as MarkdownIt from "markdown-it";
import * as MarkdownEmoji from "markdown-it-emoji";

const misc = require("smc-util/misc");

import { math_escape, math_unescape } from "smc-util/markdown-utils";

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

const emojis = {
  shortcuts: {
    smile: [":-)"],
    disappointed: [":-("],
    sweat_smile: ["^^"],
    scream: [":omg:"],
    stuck_out_tongue: [":-p"],
    neutral_face: ["-_-"],
    persevere: [">_<"],
    wink: [";-)"],
    astonished: ["o_o"],
    confused: [":-\\"]
  }
};

const markdown_it = new MarkdownIt(OPTIONS);
markdown_it.use(MarkdownEmoji, emojis);

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
