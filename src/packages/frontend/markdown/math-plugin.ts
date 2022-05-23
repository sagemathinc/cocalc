/*
This is a revamp of https://github.com/goessner/markdown-it-texmath for our purposes.
The original license with MIT, and we consider our modified version of it to also
be MIT licensed.

Original copyright:
 *  Copyright (c) Stefan Goessner - 2017-21. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.

CHANGES we made:

- We don't care about using katex for rendering, so that code is gone.
  We only care about parsing.


- RULES:

The markdown-it-texmath plugin is very impressive, but it doesn't parse
things like \begin{equation}x^3$\end{equation} without dollar signs.
However, that is a basic requirement for cocalc in order to preserve
Jupyter classic compatibility.  So we define our own rules, inspired
by the dollars rules from the the plugin,
and extend the regexps to also recognize these.  We do this with a new
object "cocalc", to avoid potential conflicts.
IMPORTANT: We remove the math_block_eqno from upstream, since it
leads to very disturbing behavior and loss of information, e.g.,
    $$x$$

    (a) xyz
Gets rendered with the xyz gone.  Very confusing.  Equation numbers
when we do them, should be done as in latex, not with some weird notation that
is surprising.  See https://github.com/sagemathinc/cocalc/issues/5879
*/

const texmath = {
  inline: (rule) =>
    function inline(state, silent) {
      const pos = state.pos;
      const str = state.src;
      const pre =
        str.startsWith(rule.tag, (rule.rex.lastIndex = pos)) &&
        (!rule.pre || rule.pre(str, pos)); // valid pre-condition ...
      const match = pre && rule.rex.exec(str);
      const res =
        !!match &&
        pos < rule.rex.lastIndex &&
        (!rule.post || rule.post(str, rule.rex.lastIndex - 1));

      if (res) {
        if (!silent) {
          const token = state.push(rule.name, "math", 0);
          token.content = match[1];
          token.markup = rule.tag;
        }
        state.pos = rule.rex.lastIndex;
      }
      return res;
    },

  block: (rule) =>
    function block(state, begLine, endLine, silent) {
      const pos = state.bMarks[begLine] + state.tShift[begLine];
      const str = state.src;
      const pre =
        str.startsWith(rule.tag, (rule.rex.lastIndex = pos)) &&
        (!rule.pre || rule.pre(str, false, pos)); // valid pre-condition ....
      const match = pre && rule.rex.exec(str);
      const res =
        !!match &&
        pos < rule.rex.lastIndex &&
        (!rule.post || rule.post(str, false, rule.rex.lastIndex - 1));

      if (res && !silent) {
        // match and valid post-condition ...
        const endpos = rule.rex.lastIndex - 1;
        let curline;

        for (curline = begLine; curline < endLine; curline++)
          if (
            endpos >= state.bMarks[curline] + state.tShift[curline] &&
            endpos <= state.eMarks[curline]
          ) {
            // line for end of block math found ...
            break;
          }
        // "this will prevent lazy continuations from ever going past our end marker"
        // https://github.com/markdown-it/markdown-it-container/blob/master/index.js
        const lineMax = state.lineMax;
        const parentType = state.parentType;
        state.lineMax = curline;
        state.parentType = "math";

        if (parentType === "blockquote") {
          // remove all leading '>' inside multiline formula
          match[1] = match[1].replace(/(\n*?^(?:\s*>)+)/gm, "");
        }
        // begin token
        let token = state.push(rule.name, "math", 0); // 'math_block'
        token.block = true;
        token.tag = rule.tag;
        token.markup = "";
        token.content = match[1];
        token.map = [begLine, curline];
        // end token ... superfluous ...

        state.parentType = parentType;
        state.lineMax = lineMax;
        state.line = curline + 1;
      }
      return res;
    },
  render: (tex, displayMode) => {
    // We need to continue to support rendering to MathJax as an option,
    // but texmath only supports katex.  Thus we output by default to
    // html using script tags, which are then parsed later using our
    // katex/mathjax plugin.
    return `<script type="math/tex${
      displayMode ? "; mode=display" : ""
    }">${tex}</script>`;
  },

  // used for enable/disable math rendering by `markdown-it`
  inlineRuleNames: ["math_inline", "math_inline_double"],
  blockRuleNames: ["math_block"],

  rules: {
    cocalc: {
      inline: [
        {
          name: "math_inline_double",
          rex: /\${2}([^$]*?[^\\])\${2}/gy,
          tag: "$$",
          displayMode: true,
          pre,
          post,
        },
        {
          // We modify this from what's included in markdown-it-texmath to allow for
          // multiple line inline formulas, e.g., "$2+\n3$" should work, but doesn't in upstream.
          name: "math_inline",
          rex: /\$((?:[^\$\s\\])|(?:[\S\s]*?[^\\]))\$/gmy,
          tag: "$",
          outerSpace: false,
          pre,
          post,
        },
        {
          // using \begin/\end as part of inline markdown...
          name: "math_inline",
          rex: /(\\(?:begin)(\{math\})[\s\S]*?\\(?:end)\2)/gmy,
          tag: "\\",
          displayMode: false,
          pre,
          post,
        },
        {
          // using \begin/\end as part of inline markdown...
          name: "math_inline_double",
          rex: /(\\(?:begin)(\{[a-z]*\*?\})[\s\S]*?\\(?:end)\2)/gmy,
          tag: "\\",
          displayMode: true,
          pre,
          post,
        },
      ],
      block: [
        {
          name: "math_block",
          rex: /\${2}([^$]*?[^\\])\${2}/gmy,
          tag: "$$",
        },
        {
          name: "math_block",
          rex: /(\\(?:begin)(\{[a-z]*\*?\})[\s\S]*?\\(?:end)\2)/gmy, // regexp to match \begin{...}...\end{...} environment.
          tag: "\\",
        },
      ],
    },
  },
};

export default function mathPlugin(md) {
  for (const rule of texmath.rules["cocalc"].inline) {
    md.inline.ruler.before("escape", rule.name, texmath.inline(rule)); // ! important
    md.renderer.rules[rule.name] = (tokens, idx) =>
      texmath.render(tokens[idx].content, !!rule.displayMode);
  }

  for (const rule of texmath.rules["cocalc"].block) {
    md.block.ruler.before("fence", rule.name, texmath.block(rule)); // ! important for ```math delimiters
    md.renderer.rules[rule.name] = (tokens, idx) =>
      texmath.render(tokens[idx].content, true);
  }
}

function pre(str, beg) {
  const prv = beg > 0 ? str[beg - 1].charCodeAt(0) : false;
  return (
    !prv ||
    (prv !== 0x5c && // no backslash,
      (prv < 0x30 || prv > 0x39))
  ); // no decimal digit .. before opening '$'
}

function post(str, end) {
  const nxt = str[end + 1] && str[end + 1].charCodeAt(0);
  return !nxt || nxt < 0x30 || nxt > 0x39; // no decimal digit .. after closing '$'
}
