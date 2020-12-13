/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// MathJax some code -- jQuery plugin
// ATTN: do not call MathJax directly, but always use this .mathjax() plugin.
// from React.js, the canonical way to call it is $(ReactDOM.findDOMNode(@)).mathjax() (e.g. Markdown in r_misc)

import { defaults } from "smc-util/misc";

declare var MathJax: any;
export const jQuery = $;
declare var $: any;

// this queue is used, when starting up or when it isn't configured (yet)
const mathjax_queue: any[] = [];
function mathjax_enqueue(x: any): void {
  if (MathJax?.Hub != null) {
    if (x[0] === "Typeset") {
      // insert MathJax.Hub as 2nd entry
      MathJax.Hub.Queue([x[0], MathJax.Hub, x[1]]);
    } else {
      MathJax.Hub.Queue(x);
    }
  } else {
    mathjax_queue.push(x);
  }
}

export function mathjax_finish_startup(): void {
  mathjax_queue.map(mathjax_enqueue);
}

function mathjax_typeset(el): void {
  // no MathJax.Hub, since there is no MathJax defined!
  try {
    mathjax_enqueue(["Typeset", el]);
  } catch (err) {
    // console.warn("mathjax_typeset error", { el, err });
    // This exception *does* happen sometimes -- see
    //     https://github.com/sagemathinc/cocalc/issues/3620
    // This is probably a bug in Mathjax, but whatever.
  }
}

$.fn.extend({
  mathjax(
    opts: {
      tex?: string;
      display?: boolean;
      inline?: boolean;
      hide_when_rendering?: boolean;
      cb?: Function;
    } = {}
  ) {
    opts = defaults(opts, {
      tex: undefined,
      display: false,
      inline: false,
      hide_when_rendering: false, // if true, entire element will get hidden until mathjax is rendered
      cb: undefined, // if defined, gets called as cb(t) for *every* element t in the jquery set!
    });
    return this.each(function () {
      let element, html;
      // @ts-ignore
      const t = $(this);
      if (opts.tex == null && !opts.display && !opts.inline) {
        // Doing this test is still much better than calling mathjax below, since I guess
        // it doesn't do a simple test first... and mathjax is painful.
        // This is a common special case - the code below would work, but would be
        // stupid, since it involves converting back and forth between html.
        // The test: it's definitely not <script type='math/text'> and it doesn't contain
        // a dollar sign or backslash... then it's not going to be mathjax'd.
        if ((t.attr("type") ?? "").indexOf("math/tex") == -1) {
          html = t.html();
          if (html.indexOf("$") === -1 && html.indexOf("\\") === -1) {
            opts.cb?.();
            return t;
          }
        }
        element = t;
      } else {
        let tex;
        if (opts.tex != null) {
          ({ tex } = opts);
        } else {
          tex = t.html();
        }
        if (opts.display) {
          tex = `$\${${tex}}$$`;
        } else if (opts.inline) {
          tex = `\\({${tex}}\\)`;
        }
        element = t.html(tex);
      }
      if (opts.hide_when_rendering) {
        t.hide();
      }
      mathjax_typeset(element[0]);
      if (opts.hide_when_rendering) {
        mathjax_enqueue([() => t.show()]);
      }
      if (opts.cb != null) {
        mathjax_enqueue([opts.cb, t]);
      }
      return t;
    });
  },
});
