/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
jQuery plugin to use KaTeX when possible to typeset all the math in a
jQuery DOM tree.

Falls back to mathjax *plugin* when katex fails, if said plugin is available.
Also immediately falls back to mathjax if account prefs other settings katex
is explicitly known and set to false.
*/

const CACHE_SIZE = 300;

import { renderToString, KatexOptions } from "katex";
export const jQuery = $;
declare var $: any;
import { tex2jax } from "./tex2jax";
import * as LRU from "lru-cache";

const { macros } = require("../math_katex");
import { redux } from "../app-framework";

declare global {
  interface JQuery {
    katex(): JQuery;
  }
}

$.fn.katex = function () {
  this.each(katex_plugin);
  return this;
};

const math_cache = new LRU({ max: CACHE_SIZE });

function is_macro_definition(s: string): boolean {
  for (const k of ["\\newcommand", "\\renewcommand", "\\providecommand"]) {
    if (s.indexOf(k) != -1) return true;
  }
  return false;
}

function katex_plugin(): void {
  // @ts-ignore
  const elt = $(this);

  // Run Mathjax's processor on this DOM node.
  // This puts any math it detects in nice script tags:
  //    <script type="math/tex">x^2</script>
  //    <script type="math/tex; mode=display">x^2</script>
  tex2jax.PreProcess(elt[0]);

  const always_use_mathjax: boolean = redux
    .getStore("account")
    ?.getIn(["other_settings", "katex"]) === false;

  // Select all the math and try to use katex on each part.
  elt.find("script").each(function () {
    // @ts-ignore
    const node = $(this);
    if (
      (node[0] as any).type == "math/tex" ||
      (node[0] as any).type == "math/tex; mode=display"
    ) {
      const katex_options: KatexOptions = {
        displayMode: (node[0] as any).type == "math/tex; mode=display",
        macros: macros,
        trust: true,
      } as KatexOptions; // cast required due to macros not being in the typescript def file yet.
      let text = node.text();
      const cached: any = math_cache.get(text);
      if (cached !== undefined) {
        node.replaceWith(cached.clone());
        return;
      }
      text = text.replace("\\newcommand{\\Bold}[1]{\\mathbf{#1}}", ""); // hack for sage kernel for now.
      if (always_use_mathjax || is_macro_definition(text)) {
        //console.log("using mathjax for text since is a macro defn", text);
        // Use mathjax for this.
        // 1. clear anything in cache involving the command
        const i = text.indexOf("{");
        const j = text.indexOf("}");
        if (i != -1 && j != -1) {
          const cmd = text.slice(i + 1, j);
          math_cache.forEach(function (_, key) {
            if ((key as string).indexOf(cmd) != -1) {
              math_cache.del(key);
            }
          });
        }
        // 2. Now define/display it using mathjax.
        const node0: any = node;
        if (node0.mathjax !== undefined) {
          node0.mathjax({
            cb: () => {
              // prev since mathjax puts the rendered content NEXT to the script node0, not inside it (of course).
              math_cache.set(text, node0.prev().clone());
            },
          });
        }
      } else {
        // Try to do it with katex.
        try {
          const rendered = $(renderToString(text, katex_options));
          node.replaceWith(rendered);
          math_cache.set(text, rendered.clone());
        } catch (err) {
          // Failed -- use mathjax instead.
          console.log(
            "WARNING -- ",
            err.toString(),
            " (will fall back to mathjax)"
          ); // toString since the traceback has no real value.
          // fallback to using mathjax on this -- should be rare; not horrible if this happens...
          // Except for this, this katex pluging is synchronous and does not depend on MathJax at all.
          const node0: any = node;
          if (node0.mathjax !== undefined) {
            node0.mathjax({
              cb: () => {
                // prev since mathjax puts the rendered content NEXT to the script node0, not inside it (of course).
                math_cache.set(text, node0.prev().clone());
              },
            });
          }
        }
      }
    }
  });
}
