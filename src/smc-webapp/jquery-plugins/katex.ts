/*
jQuery plugin to use KaTeX when possible to typeset all the math in a
jQuery DOM tree.

Falls back to mathjax *plugin* when katex fails, if said plugin is available.
*/

import { renderToString, KatexOptions } from "katex";

import * as $ from "jquery";

import { tex2jax } from "./tex2jax";

const { macros } = require("../math_katex");

declare global {
  interface JQuery {
    katex(): JQuery;
  }
}

export const jQuery = $;

$.fn.katex = function() {
  this.each(katex_plugin);
  return this;
};

function katex_plugin(): void {
  const elt = $(this);

  // Run Mathjax's processor on this DOM node.
  // This puts any math it detects in nice script tags:
  //    <script type="math/tex">x^2</script>
  //    <script type="math/tex; mode=display">x^2</script>
  tex2jax.PreProcess(elt[0]);

  // Select all the math and try to use katex on each part.
  elt.find("script").each(function() {
    let node = $(this);
    if (
      (node[0] as any).type == "math/tex" ||
      (node[0] as any).type == "math/tex; mode=display"
    ) {
      const katex_options: KatexOptions = {
        displayMode: (node[0] as any).type == "math/tex; mode=display",
        macros: macros
      } as KatexOptions; // cast required due to macros not being in the typescript def file yet.
      try {
        let text = node.text();
        text = text.replace("\\newcommand{\\Bold}[1]{\\mathbf{#1}}", ""); // hack for sage kernel for now.
        node.replaceWith($(renderToString(text, katex_options)));
      } catch (err) {
        console.log("WARNING -- ", err.toString()); // toString since the traceback has no real value.
        // fallback to using mathjax on this -- should be rare; not horrible if this happens...
        // Except for this, this katex pluging is synchronous and does not depend on MathJax at all.
        let node0: any = node;
        if (node0.mathjax !== undefined) node0.mathjax();
      }
    }
  });
}
