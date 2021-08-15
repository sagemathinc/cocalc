/*
React component for rendering an HTML string.

- suitable for server side rendering (e.g., nextjs)
- parses and displays math using KaTeX
- sanitizes the HTML for XSS attacks, etc., so it is safe to display to users
- optionally transforms links

TODO: This should eventually completely replace ./html.tsx:
- syntax highlighting
- searching
- opens links in a new tab, or makes clicking anchor tags runs a function
  instead of opening a new tab so can open internal cocalc links inside cocalc.
*/

import React from "react";
import htmlReactParser from "html-react-parser";
import stripXSS from "xss";

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";

interface Props {
  value: string;
  noSanitize?: boolean;
}

export function HTML2({ value }: Props) {
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

export default function HTML({ noSanitize, value }: Props) {
  if (!noSanitize) {
    value = stripXSS(value);
  }
  return <>{htmlReactParser(value)}</>;
}
