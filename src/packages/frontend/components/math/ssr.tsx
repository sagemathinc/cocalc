/*

Simple synchronous math formula component, which works fine on the frontend or
the backend (nodejs). We also use a custom component in the frontend app via
FileContext when we need something more sophisticated, e.g., fallback to async
mathjax.

*/

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";

interface Props {
  data: string;
}

export default function DefaultMath({ data }: Props) {
  const [text, math] = remove_math(math_escape(data));
  if (math.length == 0) {
    // no math
    return <>{data}</>;
  }
  for (let i = 0; i < math.length; i++) {
    math[i] = latexMathToHtml(math[i]);
  }
  // Substitute processed math back in.
  const __html = replace_all(
    math_unescape(replace_math(text, math)),
    "\\$",
    "$"
  );
  return <div dangerouslySetInnerHTML={{ __html }}></div>;
}
