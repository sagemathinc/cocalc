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
import type { IFilterXSSOptions } from "xss";

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

interface Props {
  value: string;
  style?: React.CSSProperties;
  // function that link/src hrefs are fed through; if returns undefined default is used.
  hrefTransform?: (
    href: string,
    tag: string,
    name: string
  ) => string | undefined;
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

function replace(domNode) {
  domNode = domNode;
}

function getXSSOptions(hrefTransform): IFilterXSSOptions | undefined {
  if (hrefTransform != null) {
    return {
      onTagAttr: (tag, name, value) => {
        if (name == "src" || name == "href") {
          const s = `${name}="${hrefTransform(value, tag, name) ?? value}"`;
          return s;
        }
      },
    };
  }
  return undefined;
}

export default function HTML({ hrefTransform, style, value }: Props) {
  const fileContext = useFileContext();
  value = stripXSS(
    value,
    getXSSOptions(hrefTransform ?? fileContext.hrefTransform)
  );
  return <div style={style}>{htmlReactParser(value, { replace })}</div>;
}
