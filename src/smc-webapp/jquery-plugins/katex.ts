/*
jQuery plugin to use KaTeX when possible to typeset all the math in a
jQuery DOM tree.

Falls back to mathjax *plugin* when katex fails, if said plugin is available.
*/

const CACHE_SIZE = 300;

import { renderToString, KatexOptions } from "katex";
import * as $ from "jquery";
export const jQuery = $;
import { tex2jax } from "./tex2jax";
import * as LRU from "lru-cache";

const { macros } = require("../math_katex");

declare global {
  interface JQuery {
    katex(): JQuery;
  }
}

$.fn.katex = function() {
  this.each(katex_plugin);
  return this;
};

const math_cache = LRU({ max: CACHE_SIZE });

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
      let text = node.text();
      let cached : any = math_cache.get(text);
      if (cached !== undefined) {
        node.replaceWith(cached.clone());
        return;
      }
      try {
        text = text.replace("\\newcommand{\\Bold}[1]{\\mathbf{#1}}", ""); // hack for sage kernel for now.
        let rendered = $(renderToString(text, katex_options));
        node.replaceWith(rendered);
        math_cache.set(text, rendered.clone());
      } catch (err) {
        console.log("WARNING -- ", err.toString()); // toString since the traceback has no real value.
        // fallback to using mathjax on this -- should be rare; not horrible if this happens...
        // Except for this, this katex pluging is synchronous and does not depend on MathJax at all.
        if (text.indexOf("\\newcommand") != -1) {
          // clear anything in cache involving the command
          const i = text.indexOf("{"),
            j = text.indexOf("}");
          if (i != -1 && j != -1) {
            const cmd = text.slice(i + 1, j);
            math_cache.forEach(function(_, key) {
              if ((key as string).indexOf(cmd) != -1) {
                math_cache.del(key);
              }
            });
          }
        }
        let node0: any = node;
        if (node0.mathjax !== undefined) {
          node0.mathjax({
            cb: () => {
              // parent since mathjax puts the rendered content NEXT to the script node0, not inside it (of course).
              math_cache.set(text, node0.parent().clone());
            }
          });
        }
      }
    }
  });
}
