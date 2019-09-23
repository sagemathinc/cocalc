// Don't import other stuff thus making this hard to import.

export function valid_indent(x: any): number {
  if (typeof x != "number" || isNaN(x) || x <= 1) return 4;
  return x;
}

import { Editor } from "codemirror";

export function init_style_hacks(cm: Editor): void {
  const e: any = cm.getWrapperElement(); /* any type seems needed to import this under node.js right now by the project */
  e.classList.add("smc-vfill");
  // The Codemirror themes impose their own weird fonts, but most users want whatever
  // they've configured as "monospace" in their browser.  So we force that back:
  e.setAttribute(
    "style",
    e.getAttribute("style") + "; height:100%; font-family:monospace !important;"
  );
}
