/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Conversion from Markdown *to* HTML, trying not to horribly mangle math.

We also define and configure our Markdown parsers below, which are used
in other code directly, e.g, in supporting use of the slate editor.
```
*/

export * from "./types";
export * from "./table-of-contents";

import MarkdownIt from "markdown-it";
import emojiPlugin from "markdown-it-emoji";
import { checkboxPlugin } from "./checkbox-plugin";
import { hashtagPlugin } from "./hashtag-plugin";
import { mentionPlugin } from "./mentions-plugin";
import mathPlugin from "markdown-it-texmath";
export { parseHeader } from "./header";
import Markdown from "./component";
export { Markdown };

// The markdown-it-texmath plugin is very impressive, but it doesn't parse
// things like \begin{equation}x^3$\end{equation} without dollar signs.
// However, that is a basic requirement for cocalc in order to preserve
// Jupyter classic compatibility.  So we monkey patch the plugin
// and extend the regexps to also recognize these.  We do this with a new
// delim object, to avoid any potential conflicts.
mathPlugin.rules["cocalc"] = { ...mathPlugin.rules["dollars"] };

// TODO: Note that \begin{math} / \end{math} is the only environment that should
// be inline math rather than display math.  I did not implement this edge case yet,
// and instead \begin{math} still gets interpreted as displayed math.  Note also,
// that \begin{math|displaymath}... also breaks when using mathjax (e.g., it's broken
// in jupyter upstream), but works with our slate editor and renderer.

mathPlugin.rules["cocalc"].block.push({
  name: "math_block",
  rex: /(\\(?:begin)(\{[a-z]*\*?\})[\s\S]*?\\(?:end)\2)/gmy, // regexp to match \begin{...}...\end{...} environment.
  tmpl: "<section><eqn>$1</eqn></section>",
  tag: "\\",
});

// using \begin/\end as part of inline markdown...
mathPlugin.rules["cocalc"].inline.push({
  name: "math_inline_double",
  rex: /(\\(?:begin)(\{[a-z]*\*?\})[\s\S]*?\\(?:end)\2)/gmy,
  tag: "\\",
  displayMode: true,
  tmpl: "<section><eqn>$1</eqn></section>",
  pre: mathPlugin.$_pre,
  post: mathPlugin.$_post,
});

const MarkdownItFrontMatter = require("markdown-it-front-matter");

export const OPTIONS: MarkdownIt.Options = {
  html: true,
  typographer: false,
  linkify: true,
  breaks: false, // breaks=true is NOT liked by many devs.
};

const PLUGINS = [
  [
    mathPlugin,
    {
      delimiters: "cocalc",
      engine: {
        renderToString: (tex, options) => {
          // We need to continue to support rendering to MathJax as an option,
          // but texmath only supports katex.  Thus we output by default to
          // html using script tags, which are then parsed later using our
          // katex/mathjax plugin.
          return `<script type="math/tex${
            options.displayMode ? "; mode=display" : ""
          }">${tex}</script>`;
        },
      },
    },
  ],
  [emojiPlugin],
  [checkboxPlugin],
  [hashtagPlugin],
  [mentionPlugin],
];
const PLUGINS_NO_HASHTAGS = [
  [mathPlugin, { delimiters: "cocalc" }],
  [emojiPlugin],
  [checkboxPlugin],
  [mentionPlugin],
];

function usePlugins(m, plugins) {
  for (const [plugin, options] of plugins) {
    m.use(plugin, options);
  }
}

export const markdown_it = new MarkdownIt(OPTIONS);
usePlugins(markdown_it, PLUGINS);

/*
export function markdownParser() {
  const m = new MarkdownIt(OPTIONS);
  usePlugins(m, PLUGINS);
  return m;
}*/

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
usePlugins(markdown_it_line_numbers, PLUGINS);

/*
Turn the given markdown *string* into an HTML *string*.
We heuristically try to remove and put back the math via
remove_math, so that markdown itself doesn't
mangle it too much before Mathjax/Katex finally see it.
Note that remove_math is NOT perfect, e.g., it messes up

<a href="http://abc" class="foo-$">test $</a>

However, at least it is based on code in Jupyter classical,
so agrees with them, so people are used it it as a "standard".

See https://github.com/sagemathinc/cocalc/issues/2863
for another example where remove_math is annoying.
*/

export interface MD2html {
  html: string;
  frontmatter: string;
}

interface Options {
  line_numbers?: boolean; // if given, embed extra line number info useful for inverse/forward search.
  no_hashtags?: boolean; // if given, do not specially process hashtags with the plugin
  processMath?: (string) => string; // if given, apply this function to all the math
}

function process(
  markdown_string: string,
  mode: "default" | "frontmatter",
  options?: Options
): MD2html {
  const text = markdown_string;

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
    if (options?.no_hashtags) {
      html = markdown_it_no_hashtags.render(text);
    } else if (options?.line_numbers) {
      html = markdown_it_line_numbers.render(text);
    } else {
      html = markdown_it.render(text);
    }
  }
  return { html, frontmatter };
}

export function markdown_to_html_frontmatter(s: string): MD2html {
  return process(s, "frontmatter");
}

// This is needed right now for todo list (*ONLY* because they use an
// old approach to parsing hashtags).
const markdown_it_no_hashtags = new MarkdownIt(OPTIONS);
usePlugins(markdown_it, PLUGINS_NO_HASHTAGS);

export function markdown_to_html(s: string, options?: Options): string {
  return process(s, "default", options).html;
}
