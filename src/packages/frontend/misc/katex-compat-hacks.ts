/*
Unfortunately KaTeX doesn't support everything people are used to using
with MathJax, even if they "shouldn't use it".   See the long list at

https://katex.org/docs/support_table.html

In some cases we can work around this by defining macros, e.g., \mbox = \text,
which we do at

    src/packages/frontend/jquery-plugins/math-katex.ts

This file below contains horrible hacks to add additional functionality.
They could lead to breakage in weird edge cases, in theory.
*/

import { replace_all } from "@cocalc/util/misc";

export default function KaTeXCompatHacks(math: string): string {
  math = eqnarray(math);
  return math;
}


// Support eqnarray: https://github.com/KaTeX/KaTeX/issues/3643
// This is very close: "\begin{darray}{rcl} ... \end{darray}"
function eqnarray(math: string): string {
  if (!math.includes("\\begin{eqnarray")) return math;
  // Note that darray never has equation numbers in katex as far as i can tell...
  math = replace_all(math, "\\begin{eqnarray}", "\\begin{darray}{rcl}");
  math = replace_all(math, "\\end{eqnarray}", "\\end{darray}");
  math = replace_all(math, "\\begin{eqnarray*}", "\\begin{darray}{rcl}");
  math = replace_all(math, "\\end{eqnarray*}", "\\end{darray}");
  return math;
}
