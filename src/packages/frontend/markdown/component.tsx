/* Static markdown renderer. */

import React from "react";
import { markdown_to_html } from "@cocalc/frontend/markdown";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";

interface Props {
  value: string;
}

export default function Markdown({ value }: Props) {
  const __html = replace_all(
    markdown_to_html(value, { processMath: latexMathToHtml }),
    "\\$",
    "$"
  );
  return <div dangerouslySetInnerHTML={{ __html }}></div>;
}
