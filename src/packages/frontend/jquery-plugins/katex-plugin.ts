/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
jQuery plugin to use KaTeX when possible to typeset all the math in a
jQuery DOM tree.
*/

import { stripMathEnvironment } from "@cocalc/frontend/editors/slate/elements/math/index";
import $ from "jquery";
import { tex2jax } from "./tex2jax";
import { macros } from "./math-katex";

// gets defined below.
let renderToString: any = undefined;

declare global {
  interface JQuery {
    katex(): JQuery;
  }
}

export function init() {
  $.fn.katex = function (opts?: { preProcess?: boolean }) {
    this.each((i) => {
      katex_plugin($(this[i]), opts?.preProcess);
    });
    return this;
  };
}

function katex_plugin(elt, preProcess): void {
  // Run Mathjax's processor on this DOM node.
  // This puts any math it detects in nice script tags:
  //    <script type="math/tex">x^2</script>
  //    <script type="math/tex; mode=display">x^2</script>
  if (preProcess) {
    for (const e of elt) {
      // Note that tex2jax.PreProcess of course has some hard-to-decipher heuristics.  E.g., it works on
      //    $$&lt; X$$
      // but doesn't detect this as math:
      //    $$&lt;X$$
      // I guess there is a reason for that, but I have no idea what it is.
      tex2jax.PreProcess(e);
    }
  }

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
        const div = $("<div>")
          .text(text)
          .css("color", "red")
          .attr("title", `${err}`);
        node.replaceWith(div);
      }
    }
  });
}
