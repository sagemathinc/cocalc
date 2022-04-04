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

import { stripMathEnvironment } from "@cocalc/frontend/editors/slate/elements/math/index";

export const jQuery = $;
declare var $: any;
import { tex2jax } from "./tex2jax";

import { macros } from "./math-katex";
import { redux } from "../app-framework";

// gets defined below.
let renderToString: any = undefined;

declare global {
  interface JQuery {
    katex(): JQuery;
  }
}

$.fn.katex = function (opts?: { preProcess?: boolean }) {
  this.each((i) => {
    katex_plugin($(this[i]), opts?.preProcess);
  });
  return this;
};

function katex_plugin(elt, preProcess): void {
  // Run Mathjax's processor on this DOM node.
  // This puts any math it detects in nice script tags:
  //    <script type="math/tex">x^2</script>
  //    <script type="math/tex; mode=display">x^2</script>
  if (preProcess) {
    tex2jax.PreProcess(elt[0]);
  }

  const always_use_mathjax: boolean =
    redux.getStore("account")?.getIn(["other_settings", "katex"]) === false;

  // Select all the math and try to use katex on each part.
  elt.find("script").each(async function () {
    // @ts-ignore
    const node = $(this);
    if (
      (node[0] as any).type == "math/tex" ||
      (node[0] as any).type == "math/tex; mode=display"
    ) {
      const katex_options = {
        displayMode: (node[0] as any).type == "math/tex; mode=display",
        macros,
        trust: true,
        globalGroup: true, // See https://github.com/sagemathinc/cocalc/issues/5750
      };
      let text = node.text();
      text = text.replace("\\newcommand{\\Bold}[1]{\\mathbf{#1}}", ""); // hack for sage kernel for now.
      text = stripMathEnvironment(text);
      if (always_use_mathjax) {
        const node0: any = node;
        if (node0.mathjax !== undefined) {
          node0.mathjax();
        }
      } else {
        // Try to do it with katex.
        try {
          if (renderToString == null) {
            ({ renderToString } = (await import("katex")).default);
            // @ts-ignore -- see https : //github.com/vaadin/flow/issues/6335
            import("katex/dist/katex.min.css");
          }
          const rendered = $(renderToString(text, katex_options));
          node.replaceWith(rendered);
          // Only load css if not on share server (where css import doesn't make
          // sense, and the share server imports this its own way).
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
            node0.mathjax();
          }
        }
      }
    }
  });
}
