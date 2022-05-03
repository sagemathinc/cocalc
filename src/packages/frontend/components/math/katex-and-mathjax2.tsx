/*

More complicated not-necessarily-synchronous math formula component, which
works fine on the frontend but NOT on a backend with node.js.

This supports rendering using KaTeX with a fallback to MathJaxV2.  Also,
if the user explicitly selects in account settings to use MathJax by default,
then this only uses MathJax.

*/

import { useEffect, useRef } from "react";

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtmlOrError } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  data: string;
}

export default function KaTeXAndMathJaxV2({ data }: Props) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current == null) return;
    ref.current.innerHTML = data;
    // @ts-ignore
    $(ref.current).katex({ preProcess: true });
  }, [data]);

  if (redux.getStore("account")?.getIn(["other_settings", "katex"])) {
    // There was an error, so will fallback to the old katex + mathjaxv2 via
    // an old jquery plugin...
    const __html = attemptKatex(data);
    if (__html != null) {
      return <span dangerouslySetInnerHTML={{ __html }}></span>;
    }
  }

  return <span ref={ref}></span>;
}

function attemptKatex(data: string): undefined | string {
  // Try to use KaTeX directly, with no jquery or useEffect doing anything:
  const [text, math] = remove_math(math_escape(data));
  if (math.length == 0) return data;

  for (let i = 0; i < math.length; i++) {
    const { __html, err } = latexMathToHtmlOrError(math[i]);
    if (!err) {
      math[i] = __html;
    } else {
      // there was an error
      return;
    }
  }
  // Substitute processed math back in.
  return replace_all(math_unescape(replace_math(text, math)), "\\$", "$");
}
