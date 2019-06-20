/*
Process internal links in HTML documents that we render
*/

import { startswith } from "smc-util/misc";

import "jquery";

declare global {
  interface JQuery {
    process_internal_links(): JQuery;
  }
}

declare const $: any;

// Define the jquery plugin:
$.fn.process_internal_links = function(opts: any = {}) {
  this.each(function() {
    const e = $(this);
    const a = e.find("a");
    for (let x of a) {
      const y = $(x);
      let href = y.attr("href");
      if (href != null) {
        if (href[0] === "#") {
          // CASE: internal link on same document - do not touch (e.g., sections in jupyter/sagews)
          continue;
        }
        const href_lower = href.toLowerCase();
        if (startswith(href_lower, "mailto:")) {
          continue;
        }
        if (
          startswith(href_lower, "http://") ||
          startswith(href_lower, "https://")
        ) {
          // for now at least, just leave all such links alone, except make them
          // open in a new tab (rather than replacing this)
          y.attr("target", "_blank");
          y.attr("rel", "noopener");
          continue;
        }
        if (opts != null && opts.href_transform != null) {
          // an internal link
          // special option; used, e.g., for Jupyter's attachment: url';  also used by share server
          href = opts.href_transform(href);
          y.attr("href", href);
        }
      }
    }
    return e;
  });
  return $(this);
};

export function process_internal_links(html, viewer): string {
  //console.log "before '#{html}'"
  const elt = $("<div>");
  elt.html(html);
  elt.process_internal_links({
    href_transform(href) {
      // here we maintain the viewer option.
      href += `?viewer=${viewer}`;
      return href;
    }
  });
  html = elt.html();
  //console.log "after '#{html}'"
  return html;
}
