/*
HTML react component that is suitable for server side rendering.
*/

import React from "react";
import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";

interface Props {
  value: string;
}

export default function HTML({ value }: Props) {
  const [text, math] = remove_math(math_escape(value));
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
