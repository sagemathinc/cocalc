/*
More complicated not-necessarily-synchronous (but actually it is sync) math formula component, which
works fine on the frontend but NOT on a backend with node.js.

This supports rendering using KaTeX.

Right now it is *just* katex, so in fact is synchronous.
*/

import { useEffect, useRef } from "react";
import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtmlOrError } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";
import { replaceMathBracketDelims } from "./util";

interface Props {
  data: string;
  inMarkdown?: boolean;
}

export default function KaTeX({ data, inMarkdown }: Props) {
  const ref = useRef<any>(null);
  data = replaceMathBracketDelims(data);
  const [text, math] = remove_math(math_escape(data));

  useEffect(() => {
    // be no-op when math.length == 0.
    if (ref.current == null) return;
    // There was an error during attemptKatex below, so will fallback to the old
    // katex + mathjaxv2 via an old jquery plugin.
    ref.current.innerHTML = data;
    // @ts-ignore
    $(ref.current).katex({ preProcess: true }); // this also calls mathjax as a fallback.
  }, [data]);

  if (math.length == 0) {
    // no math and the input is text, so return as is. Definitely do NOT wrap in a span.
    // See https://github.com/sagemathinc/cocalc/issues/5920
    return <>{data}</>;
  }

  if (inMarkdown) {
    const __html = attemptKatex(text, math);
    if (__html != null) {
      // no error -- using katex is allowed and fully worked.
      return <span dangerouslySetInnerHTML={{ __html }}></span>;
    }
  }

  // didn't end up using katex, so we make a span, which we will fill in via that
  // useEffect above.
  return <span ref={ref}></span>;
}

function attemptKatex(text: string, math: string[]): undefined | string {
  // Try to use KaTeX directly, with no jquery or useEffect doing anything:
  for (let i = 0; i < math.length; i++) {
    const { __html, err } = latexMathToHtmlOrError(math[i]);
    if (!err) {
      math[i] = __html;
    } else {
      // there was an error
      const div = $("<div>")
        .text(math[i])
        .css("color", "red")
        .attr("title", `${err}`);
      const htmlString = div.prop("outerHTML");
      math[i] = htmlString;
    }
  }
  // Substitute processed math back in.
  return replace_all(math_unescape(replace_math(text, math)), "\\$", "$");
}
