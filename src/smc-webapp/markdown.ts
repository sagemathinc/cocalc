/*
Conversion from Markdown *to* HTML.

- Has the option to render math inside the markdown using KaTeX.
*/

import * as MarkdownIt from "markdown-it";
import { renderToString, KatexOptions } from "katex";

const misc = require("smc-util/misc");

const { macros } = require("./math_katex");
const { remove_math, replace_math } = require("smc-util/mathjax-utils"); // from project Jupyter

const checkboxes = function(s) {
  s = misc.replace_all(s, "[ ]", "<i class='fa fa-square-o'></i>");
  return misc.replace_all(s, "[x]", "<i class='fa fa-check-square-o'></i>");
};

const OPTIONS : MarkdownIt.Options = {
  html: true,
  typographer: true,
  linkify: true
};

const markdown_it = new MarkdownIt(OPTIONS);

/*
Turn the given markdown *string* into an HTML *string*.
Math that can't be processed using KaTeX is wrapped exactly
as is in <span class="cocalc-katex-error">...</span>,
so it can be either shown with an error style, or
subsequently processed by MathJax after its is put
in the DOM (via a jQuery selector on those spans only!).
*/
export function markdown_to_html(markdown_string: string): string {
  let text: string;
  let math: string[];
  [text, math] = remove_math(markdown_string);

  // Process checkboxes [ ].
  text = checkboxes(text);

  // Render text to HTML.
  const html: string = markdown_it.render(text);

  // Process any math using KaTeX
  let processed_math: string[] = [];
  for (let expr of math) {
    let displayMode: boolean, cut: number;
    if (expr[0] == "$" && expr[1] != "$") {
      displayMode = false;
      cut = 1;
    } else if (expr.slice(0,3) == '\\\\(') {
      displayMode = false;
      cut = 3;
    } else if (expr[0] == "$" && expr[1] == "$") {
      displayMode = true;
      cut = 2;
    } else if (expr.slice(0,3) == '\\\\[') {
      displayMode = true;
      cut = 3;
    } else {
      displayMode = false;
      cut = 0;
    }
    let processed: string;
    try {
      const options: KatexOptions = {
        displayMode,
        macros
      } as KatexOptions;   // cast required due to macros not being in the typescript def file yet.
      processed = renderToString(expr.slice(cut, expr.length - cut), options);
    } catch (err) {
      console.log("WARNING -- ", err.toString());  // toString since the traceback has no real value.
      processed = `<span class='cocalc-katex-error'>${expr}</span>`;
    }
    processed_math.push(processed);
  }

  // Return the result.
  return replace_math(html, processed_math);
}
